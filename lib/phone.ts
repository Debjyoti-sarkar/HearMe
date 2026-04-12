/** Normalise Indian mobile input to E.164 (+91…). */
export function normalizeIndiaPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }
  if (digits.length >= 11 && digits.startsWith('91')) {
    return `+${digits.slice(0, 12)}`;
  }
  if (raw.trim().startsWith('+') && digits.length >= 11) {
    return `+${digits.slice(0, 15)}`;
  }
  return null;
}

export function maskPhone(e164: string): string {
  const d = e164.replace(/\D/g, '');
  if (d.length < 4) return e164;
  const tail = d.slice(-4);
  return `•••• ${tail}`;
}
