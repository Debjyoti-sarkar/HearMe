// Driver / passenger classifier.
//
// The journey-monitor's "deviation" alarms over-trigger when the user is a
// passenger in a car, taking unexpected lefts because the driver decided to.
// This module classifies the user as DRIVER vs PASSENGER vs ON_FOOT vs IDLE
// so the journey-monitor can soften alarms when the user clearly isn't the
// one steering.
//
// Signals (10 s sample):
//   • Speed (Location.watchPositionAsync) — sustained > 7 m/s ⇒ in vehicle.
//   • Phone orientation stability (Accelerometer + Gyroscope variance) —
//     stable / mounted ⇒ likely driver, varied / handheld ⇒ likely passenger.
//   • Touch event rate (caller-supplied hint) — drivers rarely tap during
//     motion; many taps ⇒ passenger.
//
// We don't claim to be an ML model; we claim to be a useful heuristic that
// silences obvious passenger false-alarms.

import { Accelerometer, Gyroscope } from 'expo-sensors';
import * as Location from 'expo-location';

const SAMPLE_HZ = 10;
const SAMPLE_DURATION_MS = 10_000;

export type DriveClass = 'driver' | 'passenger' | 'on-foot' | 'idle';

export type DriveSample = {
  speedMps: number[];
  accelVariance: number; // m/s² variance from gravity
  gyroVariance: number; // rad/s variance
  touchRatePerMin: number | null;
};

export type DriveVerdict = {
  class: DriveClass;
  confidence: number; // 0–1
  sample: DriveSample;
  reason: string;
};

/** Pure classifier. */
export function classify(sample: DriveSample): DriveVerdict {
  const meanSpeed =
    sample.speedMps.length > 0
      ? sample.speedMps.reduce((s, v) => s + v, 0) / sample.speedMps.length
      : 0;

  if (meanSpeed < 0.4) {
    return { class: 'idle', confidence: 0.95, sample, reason: 'stationary' };
  }
  if (meanSpeed < 2.5) {
    return { class: 'on-foot', confidence: 0.9, sample, reason: 'walking pace' };
  }
  // Vehicle.
  // Driver hypothesis: phone is mounted (low accel + gyro variance), and
  // the user isn't tapping a lot. Passenger hypothesis: phone is held,
  // accel/gyro vary because of body motion + orientation changes.
  const stable = sample.accelVariance < 0.18 && sample.gyroVariance < 0.05;
  const tappy = (sample.touchRatePerMin ?? 0) > 12;

  if (stable && !tappy) {
    return {
      class: 'driver',
      confidence: 0.75,
      sample,
      reason: `speed ${meanSpeed.toFixed(1)} m/s, mounted phone, low touch rate`,
    };
  }
  if (tappy) {
    return {
      class: 'passenger',
      confidence: 0.85,
      sample,
      reason: `speed ${meanSpeed.toFixed(1)} m/s, ${sample.touchRatePerMin?.toFixed(0)} taps/min`,
    };
  }
  // Unstable phone, low taps — likely handheld passenger looking around.
  return {
    class: 'passenger',
    confidence: 0.6,
    sample,
    reason: `speed ${meanSpeed.toFixed(1)} m/s, handheld`,
  };
}

function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  let s = 0;
  for (const v of values) s += (v - mean) ** 2;
  return s / (values.length - 1);
}

function magnitude(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}

/** Collect a sample window then run the classifier. */
export async function classifyNow(opts?: {
  durationMs?: number;
  touchRatePerMin?: number | null;
}): Promise<DriveVerdict> {
  const duration = opts?.durationMs ?? SAMPLE_DURATION_MS;
  const accelMags: number[] = [];
  const gyroMags: number[] = [];
  const speeds: number[] = [];

  Accelerometer.setUpdateInterval(1000 / SAMPLE_HZ);
  Gyroscope.setUpdateInterval(1000 / SAMPLE_HZ);

  const accelSub = Accelerometer.addListener(({ x, y, z }) => {
    accelMags.push(magnitude(x, y, z));
  });
  const gyroSub = Gyroscope.addListener(({ x, y, z }) => {
    gyroMags.push(magnitude(x, y, z));
  });

  let locSub: Location.LocationSubscription | null = null;
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status === 'granted') {
      locSub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 1000,
          distanceInterval: 0,
        },
        (pos) => {
          if (typeof pos.coords.speed === 'number' && pos.coords.speed >= 0) {
            speeds.push(pos.coords.speed);
          }
        },
      );
    }
  } catch {
    /* run without speed if we can't get permission */
  }

  await new Promise((r) => setTimeout(r, duration));

  accelSub.remove();
  gyroSub.remove();
  if (locSub) locSub.remove();

  return classify({
    speedMps: speeds,
    accelVariance: variance(accelMags),
    gyroVariance: variance(gyroMags),
    touchRatePerMin: opts?.touchRatePerMin ?? null,
  });
}
