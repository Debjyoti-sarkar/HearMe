// Cloud sync for the evidence locker.
// - Each item gets a SHA-256 contentHash.
// - Items are linked by chainHash = SHA256(prevChainHash || contentHash), giving
//   a tamper-evident sequence: changing any item invalidates every later hash.
// - Media files are uploaded to a private Supabase Storage bucket (hearme-evidence).
// - Metadata is written to two tables (evidence_sessions / evidence_items) under
//   row-level security: a user can only read/write their own rows.
// - The full chainHash is also stored in the session row, so the server holds a
//   timestamped notarisation that can be re-verified later.

import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';

import { isSupabaseConfigured, supabase } from './supabase';
import {
  saveEvidenceSession,
  type EvidenceItem,
  type EvidenceSession,
} from './evidence-locker';

const BUCKET = 'hearme-evidence';

function canonicalItemString(item: EvidenceItem): string {
  // Whatever we hash MUST exclude the item's own contentHash / chainHash /
  // cloudPath, otherwise verification can't reproduce the value. Stable key
  // ordering matters too — JSON.stringify of an object literal is stable per
  // key insertion order, but we build the object explicitly to be safe.
  return JSON.stringify({
    id: item.id,
    type: item.type,
    text: item.text,
    lat: item.lat,
    lon: item.lon,
    timestamp: item.timestamp,
    alertId: item.alertId,
    tags: [...item.tags].sort(),
    hasFile: !!item.uri,
  });
}

async function sha256Hex(input: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input);
}

async function hashItem(item: EvidenceItem): Promise<string> {
  let payload = canonicalItemString(item);
  if (item.uri) {
    try {
      const file = new File(item.uri);
      const buf = await file.arrayBuffer();
      const fileDigest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, buf);
      const hex = bytesToHex(new Uint8Array(fileDigest));
      payload += `|file:${hex}`;
    } catch {
      payload += '|file:unavailable';
    }
  }
  return sha256Hex(payload);
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i].toString(16).padStart(2, '0');
    out += b;
  }
  return out;
}

function extFromItem(item: EvidenceItem): string {
  if (!item.uri) return '';
  const m = item.uri.match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toLowerCase() : 'bin';
}

function mimeFromExt(ext: string): string {
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'm4a':
    case 'aac':
      return 'audio/mp4';
    case 'wav':
      return 'audio/wav';
    case 'mp3':
      return 'audio/mpeg';
    case 'mp4':
      return 'video/mp4';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Compute the hash chain for a session in-place and return the updated copy.
 * Idempotent — re-running on a session with hashes returns the same chain.
 */
export async function computeChainAsync(
  session: EvidenceSession,
): Promise<EvidenceSession> {
  let prevChain = '';
  const items: EvidenceItem[] = [];
  for (const item of session.items) {
    const contentHash = await hashItem(item);
    const chainHash = await sha256Hex(prevChain + contentHash);
    items.push({ ...item, contentHash, chainHash });
    prevChain = chainHash;
  }
  return {
    ...session,
    items,
    chainHash: prevChain || null,
  };
}

/**
 * Verify an existing chain against current item content. Returns the index of
 * the first broken item (0-based), or -1 if the chain is valid.
 */
export async function verifyChainAsync(session: EvidenceSession): Promise<number> {
  let prevChain = '';
  for (let i = 0; i < session.items.length; i += 1) {
    const item = session.items[i];
    const contentHash = await hashItem(item);
    const chainHash = await sha256Hex(prevChain + contentHash);
    if (item.contentHash !== contentHash || item.chainHash !== chainHash) return i;
    prevChain = chainHash;
  }
  return -1;
}

export type SyncResult =
  | { ok: true; session: EvidenceSession }
  | { ok: false; reason: string; session: EvidenceSession };

async function uploadOne(
  userId: string,
  session: EvidenceSession,
  item: EvidenceItem,
): Promise<{ ok: true; cloudPath: string } | { ok: false; reason: string }> {
  if (!item.uri) return { ok: true, cloudPath: '' }; // text/location — nothing to upload
  if (item.cloudPath) return { ok: true, cloudPath: item.cloudPath }; // already uploaded
  try {
    const ext = extFromItem(item);
    const path = `${userId}/${session.id}/${item.id}.${ext}`;
    const file = new File(item.uri);
    const buffer = await file.arrayBuffer();
    const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
      contentType: mimeFromExt(ext),
      upsert: false,
    });
    if (error && !/already exists/i.test(error.message)) {
      return { ok: false, reason: error.message };
    }
    return { ok: true, cloudPath: path };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Upload media to Storage, write metadata + chain to Postgres, persist locally.
 * Honest no-op if Supabase isn't configured or the user isn't signed in.
 */
export async function syncSessionAsync(
  session: EvidenceSession,
): Promise<SyncResult> {
  if (!isSupabaseConfigured) {
    const failed = markSession(session, 'failed', 'Supabase not configured');
    await saveEvidenceSession(failed);
    return { ok: false, reason: 'Supabase not configured', session: failed };
  }
  const { data: userResp, error: userErr } = await supabase.auth.getUser();
  const user = userResp?.user;
  if (userErr || !user) {
    const failed = markSession(session, 'failed', 'Not signed in');
    await saveEvidenceSession(failed);
    return { ok: false, reason: 'Not signed in', session: failed };
  }

  const pending = markSession(session, 'pending', null);
  await saveEvidenceSession(pending);

  // Upload media first; we need cloudPath in the row insert.
  const items: EvidenceItem[] = [];
  for (const item of pending.items) {
    const r = await uploadOne(user.id, pending, item);
    if (!r.ok) {
      const failed = markSession(
        { ...pending, items: items.concat(pending.items.slice(items.length)) },
        'failed',
        `Upload failed: ${r.reason}`,
      );
      await saveEvidenceSession(failed);
      return { ok: false, reason: r.reason, session: failed };
    }
    items.push({ ...item, cloudPath: r.cloudPath || null });
  }

  // Compute chain on the post-upload items.
  const chained = await computeChainAsync({ ...pending, items });

  // Insert (or upsert) the session row.
  const { error: sessErr } = await supabase.from('evidence_sessions').upsert(
    {
      id: chained.id,
      user_id: user.id,
      start_time: chained.startTime,
      end_time: chained.endTime,
      trigger_type: chained.triggerType,
      chain_hash: chained.chainHash,
      item_count: chained.items.length,
    },
    { onConflict: 'id' },
  );
  if (sessErr) {
    const failed = markSession(chained, 'failed', sessErr.message);
    await saveEvidenceSession(failed);
    return { ok: false, reason: sessErr.message, session: failed };
  }

  // Insert items (best effort upsert per row).
  if (chained.items.length > 0) {
    const rows = chained.items.map((it, idx) => ({
      id: it.id,
      session_id: chained.id,
      user_id: user.id,
      seq: idx,
      type: it.type,
      text: it.text,
      lat: it.lat,
      lon: it.lon,
      cloud_path: it.cloudPath,
      content_hash: it.contentHash,
      chain_hash: it.chainHash,
      captured_at: it.timestamp,
      tags: it.tags,
    }));
    const { error: itemsErr } = await supabase
      .from('evidence_items')
      .upsert(rows, { onConflict: 'id' });
    if (itemsErr) {
      const failed = markSession(chained, 'failed', itemsErr.message);
      await saveEvidenceSession(failed);
      return { ok: false, reason: itemsErr.message, session: failed };
    }
  }

  const synced: EvidenceSession = {
    ...chained,
    syncStatus: 'synced',
    syncError: null,
    lastSyncAt: new Date().toISOString(),
    status: 'uploaded',
  };
  await saveEvidenceSession(synced);
  return { ok: true, session: synced };
}

function markSession(
  s: EvidenceSession,
  status: EvidenceSession['syncStatus'],
  reason: string | null,
): EvidenceSession {
  return {
    ...s,
    syncStatus: status,
    syncError: reason,
  };
}
