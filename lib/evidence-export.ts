// Lawyer / NGO export package.
//
// Produces a self-contained, externally-verifiable bundle for a single
// evidence session. The bundle is two files:
//
//   manifest.json — every item, its content hash, the chain hash, the
//                   device signature + public key, and the OpenTimestamps
//                   receipt. Plus signed Supabase URLs for the media so
//                   the recipient can fetch them directly.
//
//   summary.html  — human-readable timeline + chain-of-custody table for
//                   a legal reader. Standalone (no JS, no remote deps).
//
// The manifest is the authoritative artifact. summary.html is for humans.
//
// Verification recipe (recipient side):
//   1. SHA-256 each downloaded media file → must match item.contentHash.
//   2. Walk items in seq order: chain[i] = SHA256(chain[i-1] || contentHash[i]).
//      The final chain[N-1] must match manifest.chainHash.
//   3. Verify Ed25519 signature over chainHash with public_key from manifest.
//   4. Submit ots_receipt + chainHash to OpenTimestamps to confirm the
//      Bitcoin block attestation.

import { File, Paths } from 'expo-file-system';
import { Share } from 'react-native';

import { isSupabaseConfigured, supabase } from './supabase';
import { computeChainAsync } from './evidence-cloud';
import { exportPublicKey, signChainHash } from './evidence-signing';
import type { EvidenceItem, EvidenceSession } from './evidence-locker';

const SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 7; // 7 days

export type ExportManifestItem = {
  id: string;
  seq: number;
  type: EvidenceItem['type'];
  capturedAt: string;
  text: string | null;
  lat: number | null;
  lon: number | null;
  tags: string[];
  contentHash: string | null;
  chainHash: string | null;
  cloudPath: string | null;
  signedUrl: string | null;
};

export type ExportManifest = {
  version: 1;
  app: 'HearMe';
  sessionId: string;
  triggerType: string;
  startTime: string;
  endTime: string | null;
  itemCount: number;
  chainHash: string | null;
  signature: string | null;
  publicKey: string | null;
  signedAt: string | null;
  ots: {
    calendar: string | null;
    receiptBase64: string | null;
    submittedAt: string | null;
    bitcoinBlockHeight: number | null;
  } | null;
  items: ExportManifestItem[];
  generatedAt: string;
};

async function signedUrlForItem(item: EvidenceItem): Promise<string | null> {
  if (!isSupabaseConfigured || !item.cloudPath) return null;
  const { data, error } = await supabase.storage
    .from('hearme-evidence')
    .createSignedUrl(item.cloudPath, SIGNED_URL_TTL_SEC);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

async function loadAttestation(sessionId: string): Promise<{
  signature: string | null;
  publicKey: string | null;
  signedAt: string | null;
  ots: ExportManifest['ots'];
}> {
  if (!isSupabaseConfigured) {
    return {
      signature: null,
      publicKey: null,
      signedAt: null,
      ots: null,
    };
  }
  const { data } = await supabase
    .from('evidence_signatures')
    .select(
      'signature, public_key, signed_at, ots_calendar, ots_receipt_base64, ots_submitted_at, ots_bitcoin_block',
    )
    .eq('session_id', sessionId)
    .maybeSingle();
  if (!data) {
    return {
      signature: null,
      publicKey: null,
      signedAt: null,
      ots: null,
    };
  }
  return {
    signature: data.signature,
    publicKey: data.public_key,
    signedAt: data.signed_at,
    ots: {
      calendar: data.ots_calendar,
      receiptBase64: data.ots_receipt_base64,
      submittedAt: data.ots_submitted_at,
      bitcoinBlockHeight: data.ots_bitcoin_block,
    },
  };
}

export async function buildManifest(
  session: EvidenceSession,
): Promise<ExportManifest> {
  const chained = session.chainHash ? session : await computeChainAsync(session);

  // Re-sign locally if the server-side attestation isn't available — better a
  // local-only signature than nothing. The recipient still gets a verifiable
  // signature; what they lose is the public OTS anchor.
  const fromCloud = await loadAttestation(chained.id);
  let signature = fromCloud.signature;
  let publicKey = fromCloud.publicKey;
  let signedAt = fromCloud.signedAt;
  if (!signature && chained.chainHash) {
    try {
      const local = await signChainHash(chained.chainHash);
      signature = local.signature;
      publicKey = local.publicKey;
      signedAt = local.signedAt;
    } catch {
      publicKey = await exportPublicKey().catch(() => null);
    }
  }

  const items: ExportManifestItem[] = [];
  for (let i = 0; i < chained.items.length; i += 1) {
    const it = chained.items[i];
    items.push({
      id: it.id,
      seq: i,
      type: it.type,
      capturedAt: it.timestamp,
      text: it.text,
      lat: it.lat,
      lon: it.lon,
      tags: it.tags,
      contentHash: it.contentHash,
      chainHash: it.chainHash,
      cloudPath: it.cloudPath,
      signedUrl: await signedUrlForItem(it),
    });
  }

  return {
    version: 1,
    app: 'HearMe',
    sessionId: chained.id,
    triggerType: chained.triggerType,
    startTime: chained.startTime,
    endTime: chained.endTime,
    itemCount: chained.items.length,
    chainHash: chained.chainHash,
    signature,
    publicKey,
    signedAt,
    ots: fromCloud.ots,
    items,
    generatedAt: new Date().toISOString(),
  };
}

function escapeHtml(s: string | null): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderSummaryHtml(m: ExportManifest): string {
  const rows = m.items
    .map((it) => {
      const link = it.signedUrl
        ? `<a href="${escapeHtml(it.signedUrl)}">download</a>`
        : '—';
      const loc =
        it.lat != null && it.lon != null
          ? `<a href="https://maps.google.com/?q=${it.lat},${it.lon}">${it.lat.toFixed(5)}, ${it.lon.toFixed(5)}</a>`
          : '';
      return `<tr>
        <td>${it.seq}</td>
        <td>${escapeHtml(it.type)}</td>
        <td>${escapeHtml(it.capturedAt)}</td>
        <td>${escapeHtml(it.text)}</td>
        <td>${loc}</td>
        <td><code>${escapeHtml(it.contentHash)}</code></td>
        <td>${link}</td>
      </tr>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>HearMe — evidence export</title>
  <style>
    body { font-family: -apple-system, system-ui, Segoe UI, Roboto, sans-serif; margin: 24px; color: #111; }
    h1 { margin-bottom: 4px; }
    .sub { color: #555; margin-top: 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
    th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #f3f3f3; }
    code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 11px; word-break: break-all; }
    .box { border: 1px solid #ccc; padding: 12px; border-radius: 6px; margin-top: 16px; background: #fafafa; }
    .ok { color: #117a3d; }
    .warn { color: #b45a00; }
  </style>
</head>
<body>
  <h1>HearMe — evidence export</h1>
  <p class="sub">Session ${escapeHtml(m.sessionId)} · trigger: ${escapeHtml(m.triggerType)}</p>

  <div class="box">
    <strong>Chain of custody</strong>
    <ul>
      <li><strong>Final chain hash:</strong> <code>${escapeHtml(m.chainHash)}</code></li>
      <li><strong>Device public key (Ed25519):</strong> <code>${escapeHtml(m.publicKey)}</code></li>
      <li><strong>Signature:</strong> <code>${escapeHtml(m.signature)}</code></li>
      <li><strong>Signed at:</strong> ${escapeHtml(m.signedAt)}</li>
      <li><strong>OpenTimestamps anchor:</strong>
        ${m.ots?.receiptBase64 ? '<span class="ok">present</span>' : '<span class="warn">none — local signature only</span>'}
        ${m.ots?.bitcoinBlockHeight ? ` (Bitcoin block ${m.ots.bitcoinBlockHeight})` : ''}
      </li>
    </ul>
  </div>

  <table>
    <thead>
      <tr><th>#</th><th>Type</th><th>Captured at</th><th>Note</th><th>Location</th><th>SHA-256</th><th>File</th></tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <p style="margin-top: 24px; color: #555; font-size: 12px;">
    Generated by HearMe at ${escapeHtml(m.generatedAt)}. Verify locally by recomputing SHA-256 over each downloaded file
    and walking the chain hash with <code>sha256(prev_chain || content_hash)</code>. Then verify the Ed25519 signature
    over the final chain hash with the public key above. The OpenTimestamps receipt is a binary file that proves the
    chain hash existed at the indicated Bitcoin block — pass it through the OpenTimestamps tool to confirm.
  </p>
</body>
</html>`;
}

export type ExportResult = {
  manifestPath: string;
  htmlPath: string;
  manifest: ExportManifest;
};

/** Build the bundle on disk and return the file paths. */
export async function exportSession(
  session: EvidenceSession,
): Promise<ExportResult> {
  const manifest = await buildManifest(session);
  const html = renderSummaryHtml(manifest);

  const stamp = manifest.sessionId.replace(/[^a-zA-Z0-9-_]/g, '');
  const dir = `${Paths.cache.uri}export-${stamp}/`;
  const manifestPath = `${dir}manifest.json`;
  const htmlPath = `${dir}summary.html`;

  // Ensure dir exists (best-effort).
  try {
    const dirHandle = new (Paths as unknown as {
      Directory: new (uri: string) => { create: (opts?: { intermediates?: boolean }) => void };
    }).Directory(dir);
    dirHandle.create({ intermediates: true });
  } catch {
    /* ignore */
  }

  const manifestFile = new File(manifestPath);
  manifestFile.create({ overwrite: true });
  manifestFile.write(JSON.stringify(manifest, null, 2));

  const htmlFile = new File(htmlPath);
  htmlFile.create({ overwrite: true });
  htmlFile.write(html);

  return { manifestPath, htmlPath, manifest };
}

/**
 * Build the bundle and open the OS share sheet so the user can ship it to a
 * lawyer / NGO. RN's Share API supports text + url; for binary files we lean
 * on the device's content-resolver via the cache:// URI.
 */
export async function shareSession(session: EvidenceSession): Promise<void> {
  const result = await exportSession(session);
  const shortHash = result.manifest.chainHash?.slice(0, 12) ?? 'unsigned';
  await Share.share({
    title: `HearMe evidence — ${result.manifest.sessionId}`,
    message: `HearMe evidence export
Session: ${result.manifest.sessionId}
Trigger: ${result.manifest.triggerType}
Items: ${result.manifest.itemCount}
Chain hash: ${result.manifest.chainHash ?? '(none)'}
Public key: ${result.manifest.publicKey ?? '(none)'}
Signature: ${result.manifest.signature ?? '(none)'}
OTS anchor: ${result.manifest.ots?.calendar ?? 'none'}

Manifest file: ${result.manifestPath}
Summary HTML: ${result.htmlPath}

Verify recipe: SHA-256 each downloaded file → must match contentHash.
Walk chain: chain[i] = SHA256(chain[i-1] || contentHash[i]). Final = ${shortHash}…`,
    url: result.manifestPath,
  });
}
