// Auto-redaction.
//
// Blur faces, license plates, and PII text from photos / videos before they
// leave the phone. Real face / plate detection requires platform vision APIs
// (ML Kit Face Detection on Android, Vision FaceObservation / TextObservation
// on iOS) accessed through a native module. There is no honest pure-JS
// substitute.
//
// What this module ships:
//   • A clean `RedactionBackend` interface — region detection + image
//     manipulation are both wired here so a single native module can satisfy
//     the whole feature.
//   • A default `noopBackend` that NEVER claims to have redacted anything.
//     `redactImage()` returns `{ ok: false, redacted: false, ... }` so the
//     UI can correctly show "Auto-redact unavailable in this build".
//   • A `manualRegionsBackend` slot for hand-tap redaction (UI taps faces /
//     plates → backend blurs those rectangles). Same interface, just driven
//     from caller-supplied regions.
//
// Output contract: `redactedUri` is a NEW file. The original is never
// overwritten. The chain-of-custody can therefore include both the original
// (sealed in the locker, signed) and the redacted derivative (the one
// shareable with the public).

export type Region = { x: number; y: number; width: number; height: number; reason?: string };

export type RedactionResult = {
  ok: boolean;
  /** Set when the file has actually been blurred. */
  redacted: boolean;
  redactedUri: string | null;
  /** Reason if !ok. "noBackend" means: no native module registered. */
  reason: string | null;
  detected: { faces: Region[]; plates: Region[]; pii: Region[] };
};

export type RedactionBackend = {
  name: string;
  detect(uri: string): Promise<{ faces: Region[]; plates: Region[]; pii: Region[] }>;
  /** Blur the regions in `uri` and write a new file. */
  blur(uri: string, regions: Region[]): Promise<{ ok: boolean; outUri: string | null; reason: string | null }>;
};

const noopBackend: RedactionBackend = {
  name: 'noop',
  async detect() {
    return { faces: [], plates: [], pii: [] };
  },
  async blur() {
    return { ok: false, outUri: null, reason: 'noBackend' };
  },
};

let backend: RedactionBackend = noopBackend;

export function registerRedactionBackend(b: RedactionBackend): void {
  backend = b;
}

export function activeRedactionBackendName(): string {
  return backend.name;
}

/**
 * Auto-detect faces / plates / PII and produce a redacted derivative. With
 * the default backend this returns `{ ok: false, redacted: false, reason: 'noBackend' }`
 * — we refuse to silently return the original as if it had been redacted.
 */
export async function redactImage(uri: string): Promise<RedactionResult> {
  const detected = await backend.detect(uri);
  const allRegions = [...detected.faces, ...detected.plates, ...detected.pii];
  if (allRegions.length === 0) {
    return {
      ok: backend.name !== 'noop',
      redacted: false,
      redactedUri: null,
      reason: backend.name === 'noop' ? 'noBackend' : 'noRegions',
      detected,
    };
  }
  const r = await backend.blur(uri, allRegions);
  return {
    ok: r.ok,
    redacted: r.ok,
    redactedUri: r.outUri,
    reason: r.reason,
    detected,
  };
}

/**
 * Manual mode — caller supplies the regions (e.g. user taps faces in a
 * preview). Blurring still runs through the backend so the same native
 * pipeline handles both auto and manual flows.
 */
export async function redactImageManual(
  uri: string,
  regions: Region[],
): Promise<RedactionResult> {
  if (regions.length === 0) {
    return {
      ok: false,
      redacted: false,
      redactedUri: null,
      reason: 'noRegions',
      detected: { faces: [], plates: [], pii: [] },
    };
  }
  const r = await backend.blur(uri, regions);
  return {
    ok: r.ok,
    redacted: r.ok,
    redactedUri: r.outUri,
    reason: r.reason,
    detected: { faces: regions, plates: [], pii: [] },
  };
}

/**
 * Native-side recipe.
 *
 * Android (ML Kit + Bitmap):
 *   • Add `com.google.mlkit:face-detection` and `:text-recognition` deps.
 *   • detect(): InputImage.fromFilePath → FaceDetector → boundingBoxes.
 *     For plates, run TextRecognition + a regex filter for plate-shaped
 *     text. PII = same recognizer + regex (emails, phone numbers, IDs).
 *   • blur(): decode bitmap → for each region, copy out a sub-bitmap, apply
 *     RenderScript ScriptIntrinsicBlur (radius 25), draw back. Save as
 *     JPEG quality 90 to a new path under app cache.
 *
 * iOS (Vision):
 *   • detect(): VNDetectFaceRectanglesRequest, VNRecognizeTextRequest.
 *   • blur(): CIImage with CIGaussianBlur, masked by the boxes.
 *
 * Both backends call back into JS as a single TurboModule with `detect` and
 * `blur` methods. Wire it via `registerRedactionBackend`.
 */
export const NATIVE_RECIPE = '__see lib/auto-redaction.ts source for full ML Kit + Vision recipe__';
