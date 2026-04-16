// Kitestring-pattern timer check-in.
// User schedules: "I'll be home by HH:MM". On expiry, app prompts for
// confirmation. If the user does not confirm within the grace window, SOS fires.

export const GRACE_MS = 60_000;

export type CheckInState =
  | { kind: 'idle' }
  | { kind: 'active'; expiresAt: number; label: string | null }
  | { kind: 'grace'; expiresAt: number; label: string | null; graceUntil: number };

export function describeRemaining(ms: number): string {
  if (ms <= 0) return '0s';
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function buildCheckInState(
  expiresAt: number | null,
  graceUntil: number | null,
  now: number,
  label: string | null,
): CheckInState {
  if (expiresAt === null) return { kind: 'idle' };
  if (now < expiresAt) return { kind: 'active', expiresAt, label };
  const g = graceUntil ?? expiresAt + GRACE_MS;
  if (now < g) return { kind: 'grace', expiresAt, label, graceUntil: g };
  // Expired past grace — caller decides to fire SOS and clear.
  return { kind: 'grace', expiresAt, label, graceUntil: g };
}
