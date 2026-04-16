import { Accelerometer } from 'expo-sensors';
import * as Haptics from 'expo-haptics';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Alert, AppState, type AppStateStatus } from 'react-native';

import * as Location from 'expo-location';

import { loadContacts, loadSettings, saveContacts, saveSettings } from '../lib/app-data';
import { dialEmergency, sendSosSms, shareLocationSms } from '../lib/emergency-sms';
import * as VoiceTrigger from '../lib/voice-trigger';
import { GRACE_MS } from '../lib/timer-checkin';
import * as Session from '../lib/session';
import {
  addEvidenceItem,
  completeEvidenceSession,
  createEvidenceSession,
  saveEvidenceSession,
} from '../lib/evidence-locker';
import { syncSessionAsync } from '../lib/evidence-cloud';
import type { EmergencyContact, HearMeSettings } from '../lib/types';
import { DEFAULT_SETTINGS } from '../lib/types';

const SHAKE_DELTA_G = 1.55;
const SHAKE_DEBOUNCE_MS = 4500;
// Re-lock if app has been backgrounded for this long.
const RELOCK_AFTER_BG_MS = 30_000;

type HearMeContextValue = {
  ready: boolean;
  contacts: EmergencyContact[];
  settings: HearMeSettings;
  upsertContact: (c: EmergencyContact) => Promise<void>;
  removeContact: (id: string) => Promise<void>;
  patchSettings: (partial: Partial<HearMeSettings>) => Promise<void>;
  /** SOS after UI confirmation (home / shake non-instant). */
  executeSos: () => Promise<{ ok: boolean; message: string }>;
  shareLocation: () => Promise<{ ok: boolean; message: string }>;
  callEmergencyLine: () => Promise<void>;
  // Lock state (Duress-PIN feature)
  locked: boolean;
  unlock: () => void;
  // Timer check-in helpers
  startCheckIn: (durationMs: number, label: string | null) => Promise<void>;
  cancelCheckIn: () => Promise<void>;
};

const HearMeContext = createContext<HearMeContextValue | null>(null);

export function useHearMe() {
  const v = useContext(HearMeContext);
  if (!v) {
    return {
      ready: false,
      contacts: [],
      settings: { ...DEFAULT_SETTINGS },
      upsertContact: async () => {},
      removeContact: async () => {},
      patchSettings: async () => {},
      executeSos: async () => ({ ok: false, message: 'HearMe is not ready yet.' }),
      shareLocation: async () => ({ ok: false, message: 'HearMe is not ready yet.' }),
      callEmergencyLine: async () => {},
      locked: false,
      unlock: () => {},
      startCheckIn: async () => {},
      cancelCheckIn: async () => {},
    };
  }
  return v;
}

function ShakeBridge({
  enabled,
  instantShake,
  onShakeDetected,
}: {
  enabled: boolean;
  instantShake: boolean;
  onShakeDetected: (instantMode: boolean) => void;
}) {
  const lastFire = useRef(0);
  const prev = useRef({ x: 0, y: 0, z: 0 });
  const accelInit = useRef(false);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      appState.current = s;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!enabled) return;

    Accelerometer.setUpdateInterval(200);
    const subscription = Accelerometer.addListener((data) => {
      if (appState.current !== 'active') return;
      const { x, y, z } = data;
      if (!accelInit.current) {
        accelInit.current = true;
        prev.current = { x, y, z };
        return;
      }
      const dx = x - prev.current.x;
      const dy = y - prev.current.y;
      const dz = z - prev.current.z;
      prev.current = { x, y, z };
      const delta = Math.hypot(dx, dy, dz);
      if (delta < SHAKE_DELTA_G) return;
      const now = Date.now();
      if (now - lastFire.current < SHAKE_DEBOUNCE_MS) return;
      lastFire.current = now;
      onShakeDetected(instantShake);
    });

    return () => {
      accelInit.current = false;
      subscription.remove();
    };
  }, [enabled, instantShake, onShakeDetected]);

  return null;
}

export function HearMeProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [settings, setSettings] = useState<HearMeSettings>({ ...DEFAULT_SETTINGS });
  const [locked, setLocked] = useState(false);
  const [graceUntil, setGraceUntil] = useState<number | null>(null);
  const grace = useRef<number | null>(null);
  const lastBackgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    grace.current = graceUntil;
  }, [graceUntil]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [c, s, hasPin] = await Promise.all([
        loadContacts(),
        loadSettings(),
        Session.getPin(),
      ]);
      if (!alive) return;
      setContacts(c);
      setSettings(s);
      // Cold start: lock if app-lock is enabled AND a PIN exists.
      setLocked(s.appLockEnabled && !!hasPin);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const persistContacts = useCallback(async (next: EmergencyContact[]) => {
    setContacts(next);
    await saveContacts(next);
  }, []);

  const persistSettings = useCallback(async (next: HearMeSettings) => {
    setSettings(next);
    await saveSettings(next);
  }, []);

  const upsertContact = useCallback(
    async (c: EmergencyContact) => {
      const i = contacts.findIndex((x) => x.id === c.id);
      const next =
        i >= 0
          ? contacts.map((x) => (x.id === c.id ? c : x))
          : [...contacts, c];
      await persistContacts(next);
    },
    [contacts, persistContacts],
  );

  const removeContact = useCallback(
    async (id: string) => {
      await persistContacts(contacts.filter((c) => c.id !== id));
    },
    [contacts, persistContacts],
  );

  const patchSettings = useCallback(
    async (partial: Partial<HearMeSettings>) => {
      await persistSettings({ ...settings, ...partial });
    },
    [settings, persistSettings],
  );

  const captureSosEvidence = useCallback(async () => {
    let session = createEvidenceSession('sos');
    // Try to attach a location stamp. Fail silently — evidence is best-effort.
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === Location.PermissionStatus.GRANTED) {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        session = addEvidenceItem(session, {
          type: 'location',
          uri: null,
          text: `SOS triggered at ${new Date().toISOString()}`,
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          alertId: null,
          tags: ['sos', 'auto'],
        });
      }
    } catch {
      /* ignore */
    }
    session = completeEvidenceSession(session);
    await saveEvidenceSession(session);
    if (settings.cloudSyncEvidence) {
      // Background — never blocks the SOS toast.
      void syncSessionAsync(session);
    }
  }, [settings.cloudSyncEvidence]);

  const executeSos = useCallback(async () => {
    const r = await sendSosSms(contacts, settings);
    if (r.ok) {
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        /* ignore */
      }
      if (settings.autoCallAfterSms) {
        await dialEmergency(settings.emergencyNumber);
      }
    }
    // Capture an evidence session regardless of SMS outcome — the location
    // stamp is still useful if the user dials emergency manually.
    void captureSosEvidence();
    return r;
  }, [contacts, settings, captureSosEvidence]);

  const shareLocation = useCallback(async () => {
    return shareLocationSms(contacts);
  }, [contacts]);

  const callEmergencyLine = useCallback(async () => {
    await dialEmergency(settings.emergencyNumber);
  }, [settings.emergencyNumber]);

  const unlock = useCallback(() => setLocked(false), []);

  const startCheckIn = useCallback(
    async (durationMs: number, label: string | null) => {
      const expiresAt = Date.now() + durationMs;
      await persistSettings({
        ...settings,
        activeCheckInExpiresAt: expiresAt,
        activeCheckInLabel: label,
      });
    },
    [settings, persistSettings],
  );

  const cancelCheckIn = useCallback(async () => {
    setGraceUntil(null);
    await persistSettings({
      ...settings,
      activeCheckInExpiresAt: null,
      activeCheckInLabel: null,
    });
  }, [settings, persistSettings]);

  const onShakeDetected = useCallback(
    (instant: boolean) => {
      if (instant) {
        void executeSos().then((r) => {
          Alert.alert(r.ok ? 'SOS sent' : 'SOS failed', r.message);
        });
      } else {
        Alert.alert(
          'Shake detected',
          'Send an emergency SMS with your last known location to all trusted contacts?',
          [
            { text: 'Not now', style: 'cancel' },
            {
              text: 'Send alert',
              style: 'destructive',
              onPress: () =>
                void executeSos().then((r) => {
                  Alert.alert(r.ok ? 'Sent' : 'Could not send', r.message);
                }),
            },
          ],
        );
      }
    },
    [executeSos],
  );

  // ---- App-state driven re-lock ----
  useEffect(() => {
    if (!ready) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'inactive') {
        lastBackgroundedAt.current = Date.now();
      } else if (next === 'active' && lastBackgroundedAt.current) {
        const away = Date.now() - lastBackgroundedAt.current;
        lastBackgroundedAt.current = null;
        if (settings.appLockEnabled && away > RELOCK_AFTER_BG_MS) {
          void Session.getPin().then((pin) => {
            if (pin) setLocked(true);
          });
        }
      }
    });
    return () => sub.remove();
  }, [ready, settings.appLockEnabled]);

  // ---- Voice trigger ----
  useEffect(() => {
    if (!ready) return;
    if (!settings.voiceTriggerEnabled) {
      void VoiceTrigger.stopListening();
      return;
    }
    let cancelled = false;
    void VoiceTrigger.startListening(() => {
      // Coalesce with confirm dialog — better than silent SOS for false positives.
      Alert.alert(
        'Voice trigger',
        `Detected sustained loud audio${settings.voiceSafeWord ? ` (safe word: "${settings.voiceSafeWord}")` : ''}. Send SOS?`,
        [
          { text: 'No', style: 'cancel' },
          {
            text: 'Send SOS',
            style: 'destructive',
            onPress: () =>
              void executeSos().then((r) => {
                Alert.alert(r.ok ? 'SOS sent' : 'SOS failed', r.message);
              }),
          },
        ],
      );
    }).then((ok) => {
      if (cancelled || !ok) return;
    });
    return () => {
      cancelled = true;
      void VoiceTrigger.stopListening();
    };
  }, [ready, settings.voiceTriggerEnabled, settings.voiceSafeWord, executeSos]);

  // ---- Timer check-in tick ----
  useEffect(() => {
    if (!ready) return;
    const expiresAt = settings.activeCheckInExpiresAt;
    if (expiresAt === null) {
      setGraceUntil(null);
      return;
    }
    const tick = setInterval(() => {
      const now = Date.now();
      if (now < expiresAt) return;
      // Past expiry — open grace window, prompt user.
      if (grace.current === null) {
        const newGrace = expiresAt + GRACE_MS;
        setGraceUntil(newGrace);
        Alert.alert(
          'Check-in due',
          `Your timer "${settings.activeCheckInLabel ?? 'check-in'}" has ended. Confirm you are safe within ${Math.round(GRACE_MS / 1000)} seconds or SOS will fire.`,
          [
            {
              text: "I'm safe",
              onPress: () => void cancelCheckIn(),
            },
            {
              text: 'Send SOS now',
              style: 'destructive',
              onPress: () => {
                void executeSos();
                void cancelCheckIn();
              },
            },
          ],
        );
      } else if (now >= grace.current) {
        // Grace expired — auto-fire and clear.
        void executeSos().then((r) => {
          Alert.alert(r.ok ? 'Check-in SOS sent' : 'SOS failed', r.message);
        });
        void cancelCheckIn();
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [
    ready,
    settings.activeCheckInExpiresAt,
    settings.activeCheckInLabel,
    cancelCheckIn,
    executeSos,
  ]);

  const value = useMemo<HearMeContextValue>(
    () => ({
      ready,
      contacts,
      settings,
      upsertContact,
      removeContact,
      patchSettings,
      executeSos,
      shareLocation,
      callEmergencyLine,
      locked,
      unlock,
      startCheckIn,
      cancelCheckIn,
    }),
    [
      ready,
      contacts,
      settings,
      upsertContact,
      removeContact,
      patchSettings,
      executeSos,
      shareLocation,
      callEmergencyLine,
      locked,
      unlock,
      startCheckIn,
      cancelCheckIn,
    ],
  );

  return (
    <HearMeContext.Provider value={value}>
      <ShakeBridge
        enabled={ready && settings.shakeEnabled}
        instantShake={settings.instantShake}
        onShakeDetected={onShakeDetected}
      />
      {children}
    </HearMeContext.Provider>
  );
}
