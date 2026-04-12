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

import { loadContacts, loadSettings, saveContacts, saveSettings } from '../lib/app-data';
import { dialEmergency, sendSosSms, shareLocationSms } from '../lib/emergency-sms';
import type { EmergencyContact, HearMeSettings } from '../lib/types';
import { DEFAULT_SETTINGS } from '../lib/types';

const SHAKE_DELTA_G = 1.55;
const SHAKE_DEBOUNCE_MS = 4500;

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
};

const HearMeContext = createContext<HearMeContextValue | null>(null);

export function useHearMe() {
  const v = useContext(HearMeContext);
  if (!v) throw new Error('useHearMe must be used inside HearMeProvider');
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

  useEffect(() => {
    let alive = true;
    (async () => {
      const [c, s] = await Promise.all([loadContacts(), loadSettings()]);
      if (!alive) return;
      setContacts(c);
      setSettings(s);
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
    return r;
  }, [contacts, settings]);

  const shareLocation = useCallback(async () => {
    return shareLocationSms(contacts);
  }, [contacts]);

  const callEmergencyLine = useCallback(async () => {
    await dialEmergency(settings.emergencyNumber);
  }, [settings.emergencyNumber]);

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
