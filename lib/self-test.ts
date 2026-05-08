// Self-test scheduler.
//
// A safety app is only useful if the pipes are still wired up *when* you
// need them. People uninstall app updates, OS upgrades reset permissions,
// battery optimisers murder the foreground service. By the time the user
// fires an SOS, "everything works" is wishful thinking.
//
// Self-test exercises every critical pipeline non-destructively and reports
// pass / fail / unknown. It runs:
//   • on demand (Settings → Run self-test now),
//   • on a weekly schedule (the caller drives the cadence — see schedule.ts
//     wiring at the end of this file).
//
// Each check has an `id`, a `name`, a `severity`, and a result. Results
// flow into the alert-history log so the user has a paper trail.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as SMS from 'expo-sms';
import { Audio } from 'expo-av';
import { Linking, Platform } from 'react-native';
import * as LocalAuth from 'expo-local-authentication';

import { loadPairRecord } from './neuroband-storage';
import { isSupabaseConfigured, supabase } from './supabase';
import { loadContacts } from './app-data';

export type SelfTestSeverity = 'critical' | 'recommended' | 'info';

export type SelfTestResult = {
  id: string;
  name: string;
  severity: SelfTestSeverity;
  status: 'pass' | 'fail' | 'unknown';
  detail: string;
  fixHint: string | null;
  ranAtMs: number;
};

export type SelfTestReport = {
  ranAtMs: number;
  durationMs: number;
  results: SelfTestResult[];
};

type Probe = () => Promise<Omit<SelfTestResult, 'ranAtMs' | 'id' | 'name' | 'severity'>>;

const PROBES: { id: string; name: string; severity: SelfTestSeverity; run: Probe }[] = [
  {
    id: 'sms',
    name: 'SMS pipeline',
    severity: 'critical',
    async run() {
      const ok = await SMS.isAvailableAsync();
      return ok
        ? { status: 'pass', detail: 'SMS composer reachable', fixHint: null }
        : {
            status: 'fail',
            detail: 'SMS not available — emergency SMS will not send',
            fixHint:
              Platform.OS === 'ios'
                ? 'Sign into iMessage / SMS in Settings → Messages.'
                : 'Set a default SMS app and grant permission to HearMe.',
          };
    },
  },
  {
    id: 'contacts',
    name: 'Trusted contacts',
    severity: 'critical',
    async run() {
      const list = await loadContacts();
      if (list.length === 0) {
        return {
          status: 'fail',
          detail: 'No trusted contacts saved',
          fixHint: 'Open Contacts tab and add at least one number.',
        };
      }
      const valid = list.filter((c) => c.phone.replace(/\D/g, '').length >= 8).length;
      if (valid === 0) {
        return {
          status: 'fail',
          detail: `Saved ${list.length} contact(s) but none have a valid phone number`,
          fixHint: 'Edit each contact and ensure the phone number includes country code.',
        };
      }
      return {
        status: 'pass',
        detail: `${valid} valid contact(s)`,
        fixHint: null,
      };
    },
  },
  {
    id: 'location',
    name: 'Location accuracy',
    severity: 'critical',
    async run() {
      const perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        return {
          status: 'fail',
          detail: 'Foreground location permission denied',
          fixHint: 'Enable location for HearMe in OS settings.',
        };
      }
      const enabled = await Location.hasServicesEnabledAsync();
      if (!enabled) {
        return {
          status: 'fail',
          detail: 'Location services off',
          fixHint: 'Turn on Location in OS settings.',
        };
      }
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        const acc = pos.coords.accuracy ?? 9999;
        if (acc > 75) {
          return {
            status: 'fail',
            detail: `GPS accuracy ${acc.toFixed(0)} m — too coarse for SOS`,
            fixHint: 'Move outdoors or restart the GPS by toggling location off/on.',
          };
        }
        return {
          status: 'pass',
          detail: `Accuracy ~${acc.toFixed(0)} m`,
          fixHint: null,
        };
      } catch (e) {
        return {
          status: 'fail',
          detail: `Could not read GPS: ${e instanceof Error ? e.message : String(e)}`,
          fixHint: 'Restart the device and try again.',
        };
      }
    },
  },
  {
    id: 'mic',
    name: 'Microphone',
    severity: 'critical',
    async run() {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        return {
          status: 'fail',
          detail: 'Microphone permission denied',
          fixHint: 'Enable mic permission in OS settings.',
        };
      }
      try {
        const rec = new Audio.Recording();
        await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.LOW_QUALITY);
        await rec.startAsync();
        await new Promise((r) => setTimeout(r, 200));
        await rec.stopAndUnloadAsync();
        return { status: 'pass', detail: 'Mic engaged for 200 ms', fixHint: null };
      } catch (e) {
        return {
          status: 'fail',
          detail: `Mic failed: ${e instanceof Error ? e.message : String(e)}`,
          fixHint: 'Restart the app and re-grant mic permission.',
        };
      }
    },
  },
  {
    id: 'biometric',
    name: 'Biometric unlock',
    severity: 'recommended',
    async run() {
      const supported = await LocalAuth.hasHardwareAsync();
      if (!supported) {
        return {
          status: 'unknown',
          detail: 'Device has no biometric hardware',
          fixHint: null,
        };
      }
      const enrolled = await LocalAuth.isEnrolledAsync();
      if (!enrolled) {
        return {
          status: 'fail',
          detail: 'No biometric enrolled',
          fixHint: 'Enrol Face ID / fingerprint in OS Settings.',
        };
      }
      return { status: 'pass', detail: 'Biometric available', fixHint: null };
    },
  },
  {
    id: 'band',
    name: 'NeuroBand link',
    severity: 'recommended',
    async run() {
      const pair = await loadPairRecord();
      if (!pair) {
        return {
          status: 'unknown',
          detail: 'No NeuroBand paired',
          fixHint: null,
        };
      }
      const ageMs = Date.now() - pair.lastSeenAt;
      if (ageMs > 30 * 60 * 1000) {
        return {
          status: 'fail',
          detail: `Band last seen ${Math.round(ageMs / 60000)} min ago`,
          fixHint: 'Bring the band within range and re-enable Bluetooth.',
        };
      }
      return { status: 'pass', detail: `Band seen ${Math.round(ageMs / 1000)} s ago`, fixHint: null };
    },
  },
  {
    id: 'battery-optimization',
    name: 'Battery optimisation',
    severity: 'recommended',
    async run() {
      if (Platform.OS !== 'android') {
        return { status: 'unknown', detail: 'iOS — N/A', fixHint: null };
      }
      // We can't read the optimisation list from JS; the honest answer is
      // 'unknown' + a fix-hint that links to the settings.
      return {
        status: 'unknown',
        detail: 'Cannot programmatically check Android battery optimisation',
        fixHint:
          'Open Settings → Apps → HearMe → Battery → Unrestricted to keep alerts running in the background.',
      };
    },
  },
  {
    id: 'cloud',
    name: 'Supabase cloud sync',
    severity: 'info',
    async run() {
      if (!isSupabaseConfigured) {
        return {
          status: 'unknown',
          detail: 'Supabase env vars not set in this build',
          fixHint: null,
        };
      }
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) {
          return {
            status: 'fail',
            detail: `Auth error: ${error.message}`,
            fixHint: 'Sign in again in Settings.',
          };
        }
        return data?.user
          ? { status: 'pass', detail: `Signed in as ${data.user.email ?? data.user.id}`, fixHint: null }
          : { status: 'fail', detail: 'Not signed in', fixHint: 'Sign in to sync evidence.' };
      } catch (e) {
        return {
          status: 'fail',
          detail: `Cloud unreachable: ${e instanceof Error ? e.message : String(e)}`,
          fixHint: 'Check your network connection.',
        };
      }
    },
  },
  {
    id: 'battery-level',
    name: 'Device battery',
    severity: 'recommended',
    async run() {
      try {
        // expo-battery isn't a hard dep — try-require so the bundle doesn't
        // break if it's missing.
        type BatteryShape = { getBatteryLevelAsync?: () => Promise<number> };
        let battery: BatteryShape | null = null;
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          battery = require('expo-battery') as BatteryShape;
        } catch {
          battery = null;
        }
        if (!battery || !battery.getBatteryLevelAsync) {
          return {
            status: 'unknown',
            detail: 'expo-battery not installed',
            fixHint: 'Add expo-battery to enable this check.',
          };
        }
        const lvl = await battery.getBatteryLevelAsync();
        if (typeof lvl !== 'number' || lvl < 0) {
          return {
            status: 'unknown',
            detail: 'Battery level unavailable',
            fixHint: null,
          };
        }
        const pct = Math.round(lvl * 100);
        if (pct < 15) {
          return {
            status: 'fail',
            detail: `Battery ${pct}%`,
            fixHint: 'Charge before going out — SOS pipeline drains the radio quickly.',
          };
        }
        return { status: 'pass', detail: `Battery ${pct}%`, fixHint: null };
      } catch {
        return { status: 'unknown', detail: 'Battery level unavailable', fixHint: null };
      }
    },
  },
];

export async function runSelfTest(): Promise<SelfTestReport> {
  const startedAt = Date.now();
  const results: SelfTestResult[] = [];
  for (const probe of PROBES) {
    const out = await probe.run().catch((e) => ({
      status: 'fail' as const,
      detail: e instanceof Error ? e.message : String(e),
      fixHint: null,
    }));
    results.push({
      id: probe.id,
      name: probe.name,
      severity: probe.severity,
      ...out,
      ranAtMs: Date.now(),
    });
  }
  return {
    ranAtMs: startedAt,
    durationMs: Date.now() - startedAt,
    results,
  };
}

const LAST_RUN_KEY = '@hearme/self_test_last_v1';

export async function lastSelfTestReport(): Promise<SelfTestReport | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_RUN_KEY);
    return raw ? (JSON.parse(raw) as SelfTestReport) : null;
  } catch {
    return null;
  }
}

export async function saveSelfTestReport(report: SelfTestReport): Promise<void> {
  await AsyncStorage.setItem(LAST_RUN_KEY, JSON.stringify(report));
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Should we auto-run a self-test now? Caller wires this into app start /
 * a foreground tick — if it returns true, run + save.
 */
export async function isSelfTestDue(): Promise<boolean> {
  const last = await lastSelfTestReport();
  if (!last) return true;
  return Date.now() - last.ranAtMs > WEEK_MS;
}

/** Open OS settings page that's relevant to the worst failure. */
export async function openFixForResult(result: SelfTestResult): Promise<void> {
  if (!result.fixHint) return;
  if (Platform.OS === 'android') {
    try {
      await Linking.openSettings();
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    await Linking.openURL('app-settings:');
  } catch {
    /* ignore */
  }
}
