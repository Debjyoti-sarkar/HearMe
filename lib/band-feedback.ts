// Band-side LED / haptic feedback codes.
//
// Extends the existing `command` characteristic protocol (0x01 = haptic buzz)
// with a richer code book the user can feel-through-the-wrist without looking
// at the phone. Useful when the phone is in a bag, or when the user is mid-
// confrontation and can't safely reach for it.
//
// Encoding: a single byte. Upper nibble = category, lower nibble = code.
//
//   0x0X  legacy (compatibility with two-way-duress.ts)
//   0x1X  acknowledgement codes  (user-facing "we got it")
//   0x2X  warning codes           (system needs attention)
//   0x3X  status codes            (silent state changes)
//
// For each code we ship:
//   • a haptic pattern (vibration timings) — felt on the band motor + as
//     fallback on the phone Vibration API
//   • an LED pattern   (color + pulse) — sent to the band's LED char if the
//     firmware supports it; ignored otherwise
//
// The dispatcher is event-driven: app-layer events (relay sent / contact
// acked / journey on track / battery low …) map to a single feedback code.
// One source of truth, one place to tune.

import { Vibration } from 'react-native';

import { sendHapticBuzz } from './neuroband-ble';

export type BandCode =
  | 0x01 // legacy buzz
  | 0x02 // legacy challenge (3 short)
  | 0x03 // legacy reassurance (1 long)
  | 0x04 // legacy alarm (rapid)
  | 0x10 // ack: SMS sent
  | 0x11 // ack: contact opened the link
  | 0x12 // ack: helper on the way
  | 0x13 // ack: live-share viewer joined
  | 0x14 // ack: evidence uploaded
  | 0x15 // ack: SOS cancelled (by user)
  | 0x20 // warn: low battery
  | 0x21 // warn: BLE link weak
  | 0x22 // warn: no GPS
  | 0x23 // warn: tamper / cap removed
  | 0x24 // warn: stalker detected
  | 0x30 // status: journey on track
  | 0x31 // status: deviation detected
  | 0x32 // status: check-in due in 1 min
  | 0x33; // status: workout-mode armed

type Pattern = {
  vibrate: number[]; // ms on/off pairs (RN format)
  led: { color: 'red' | 'amber' | 'green' | 'blue' | 'white'; pulses: number; pulseMs: number };
};

const PATTERNS: Record<BandCode, Pattern> = {
  0x01: { vibrate: [0, 120], led: { color: 'white', pulses: 1, pulseMs: 120 } },
  0x02: {
    vibrate: [0, 120, 250, 120, 250, 120],
    led: { color: 'amber', pulses: 3, pulseMs: 120 },
  },
  0x03: { vibrate: [0, 1500], led: { color: 'green', pulses: 1, pulseMs: 1500 } },
  0x04: {
    vibrate: [0, 80, 80, 80, 80, 80, 80, 80, 80, 80],
    led: { color: 'red', pulses: 5, pulseMs: 80 },
  },
  // 0x1X — acknowledgements
  0x10: { vibrate: [0, 80, 60, 80], led: { color: 'green', pulses: 2, pulseMs: 80 } },
  0x11: { vibrate: [0, 60, 40, 60, 40, 60], led: { color: 'green', pulses: 3, pulseMs: 60 } },
  0x12: {
    vibrate: [0, 120, 100, 60, 100, 60, 100],
    led: { color: 'green', pulses: 4, pulseMs: 100 },
  },
  0x13: { vibrate: [0, 100, 80, 100], led: { color: 'blue', pulses: 2, pulseMs: 100 } },
  0x14: { vibrate: [0, 200], led: { color: 'green', pulses: 1, pulseMs: 200 } },
  0x15: { vibrate: [0, 600, 200, 200], led: { color: 'green', pulses: 2, pulseMs: 200 } },
  // 0x2X — warnings
  0x20: {
    vibrate: [0, 200, 400, 200, 400, 200],
    led: { color: 'amber', pulses: 3, pulseMs: 200 },
  },
  0x21: { vibrate: [0, 100, 200, 100], led: { color: 'amber', pulses: 2, pulseMs: 100 } },
  0x22: {
    vibrate: [0, 300, 200, 100, 200, 300],
    led: { color: 'amber', pulses: 3, pulseMs: 250 },
  },
  0x23: {
    vibrate: [0, 500, 100, 500, 100, 500],
    led: { color: 'red', pulses: 3, pulseMs: 500 },
  },
  0x24: {
    vibrate: [0, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80],
    led: { color: 'red', pulses: 6, pulseMs: 80 },
  },
  // 0x3X — silent statuses
  0x30: { vibrate: [0, 30], led: { color: 'green', pulses: 1, pulseMs: 30 } },
  0x31: { vibrate: [0, 80, 60, 80], led: { color: 'amber', pulses: 2, pulseMs: 80 } },
  0x32: { vibrate: [0, 100], led: { color: 'amber', pulses: 1, pulseMs: 100 } },
  0x33: { vibrate: [0, 60, 40, 60], led: { color: 'blue', pulses: 2, pulseMs: 60 } },
};

export type BandFeedbackBackend = {
  /** Send the raw byte to the band command char. */
  sendByte(byte: BandCode): Promise<void>;
  /** Optional — set RGB LED. Fallback ignores. */
  setLed?(color: Pattern['led']['color'], pulses: number, pulseMs: number): Promise<void>;
};

const defaultBackend: BandFeedbackBackend = {
  async sendByte(_byte) {
    // Maps to the existing single-byte channel. Granularity beyond buzz/no-buzz
    // depends on the firmware honouring the extended code book.
    await sendHapticBuzz();
  },
};

let backend: BandFeedbackBackend = defaultBackend;

export function registerBandFeedbackBackend(b: BandFeedbackBackend): void {
  backend = b;
}

/** Fire a code — vibrates the phone immediately + sends to band. */
export async function emit(code: BandCode): Promise<void> {
  const pattern = PATTERNS[code];
  if (!pattern) return;
  try {
    Vibration.vibrate(pattern.vibrate);
  } catch {
    /* phone vibration not always available */
  }
  try {
    await backend.sendByte(code);
  } catch {
    /* ignore */
  }
  if (backend.setLed) {
    try {
      await backend.setLed(pattern.led.color, pattern.led.pulses, pattern.led.pulseMs);
    } catch {
      /* ignore */
    }
  }
}

// Convenience event-mapping helpers — call these from app-layer code.

export const ackSmsSent = () => emit(0x10);
export const ackContactOpened = () => emit(0x11);
export const ackHelperOnTheWay = () => emit(0x12);
export const ackLiveShareViewer = () => emit(0x13);
export const ackEvidenceUploaded = () => emit(0x14);
export const ackSosCancelled = () => emit(0x15);

export const warnLowBattery = () => emit(0x20);
export const warnBleWeak = () => emit(0x21);
export const warnNoGps = () => emit(0x22);
export const warnTamper = () => emit(0x23);
export const warnStalker = () => emit(0x24);

export const statusJourneyOnTrack = () => emit(0x30);
export const statusJourneyDeviation = () => emit(0x31);
export const statusCheckInDue = () => emit(0x32);
export const statusWorkoutArmed = () => emit(0x33);
