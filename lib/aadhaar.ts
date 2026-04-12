/**
 * Formatting + basic pattern checks only.
 * Real Aadhaar verification must use UIDAI-authorised eKYC / licensed ASP.
 */
export function formatAadhaarDigits(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 12);
  const parts: string[] = [];
  for (let i = 0; i < d.length; i += 4) {
    parts.push(d.slice(i, i + 4));
  }
  return parts.join(' ');
}

export function digitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

/** Heuristic plausibility — not a cryptographic UIDAI check. */
export function isPlausibleAadhaar12(d12: string): boolean {
  if (!/^\d{12}$/.test(d12)) return false;
  if (/^(\d)\1{11}$/.test(d12)) return false;
  // UID-issued numbers typically do not start with 0 or 1
  if (/^[01]/.test(d12)) return false;
  return true;
}
