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
import { startSiren, stopSiren } from '../lib/siren';
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
import {
  connectAndSubscribe,
  isBleNativeAvailable,
  startMockStream,
  type BioFrame,
  type BioSubscription,
  type ConnectionState,
} from '../lib/neuroband-ble';
import {
  bitmapToString,
  emptySustained,
  fuse,
  instantMarkers,
  updateSustained,
  type FusionConfig,
  type Marker,
} from '../lib/neuroband-fusion';
import {
  appendEvent,
  EMPTY_BASELINES,
  loadBaselines,
  loadPairRecord,
  saveBaselines,
  updateBaselines,
  type NeuroBandBaselines,
} from '../lib/neuroband-storage';

const SHAKE_DELTA_G = 1.55;
const SHAKE_DEBOUNCE_MS = 4500;
// Re-lock if app has been backgrounded for this long.
const RELOCK_AFTER_BG_MS = 30_000;

export type NeuroBandLiveState = {
  connection: ConnectionState;
  /** Most recent BioFrame, or null if not yet streaming. */
  lastFrame: BioFrame | null;
  /** Per-marker fired-this-frame view, useful for the live signal panel. */
  instant: Record<Marker, boolean>;
  /** Sustained-window counts (0..10). */
  sustained: Record<Marker, number>;
  /** Calibration progress 0..1. */
  calibrationProgress: number;
  /** Currently in workout-mode lockout? */
  workoutModeActive: boolean;
};

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
  // NeuroBand
  neuroBand: NeuroBandLiveState;
  /** Force-fire a silent SOS from the NeuroBand path (used by cap-touch). */
  triggerNeuroBandSos: (reason: string) => Promise<void>;
};

const HearMeContext = createContext<HearMeContextValue | null>(null);

const FALLBACK_NEUROBAND_STATE: NeuroBandLiveState = {
  connection: 'disabled',
  lastFrame: null,
  instant: { hr: false, gsr: false, temp: false, spo2: false, semg: false },
  sustained: { hr: 0, gsr: 0, temp: 0, spo2: 0, semg: 0 },
  calibrationProgress: 0,
  workoutModeActive: false,
};

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
      neuroBand: FALLBACK_NEUROBAND_STATE,
      triggerNeuroBandSos: async () => {},
    } satisfies HearMeContextValue;
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

/**
 * NeuroBand BLE bridge. Mirrors ShakeBridge:
 *   - Subscribes when enabled, unsubscribes on disable.
 *   - Pure side-effect component, returns null.
 *   - Callbacks reach into provider state via stable handler refs.
 */
type NeuroBandBridgeProps = {
  enabled: boolean;
  mockMode: boolean;
  fusionConfig: FusionConfig;
  onFrame: (frame: BioFrame) => void;
  onDuress: (markerBitmap: number, frame: BioFrame) => void;
  onSilentTap: () => void;
  onState: (state: ConnectionState, info?: string) => void;
};

function NeuroBandBridge({
  enabled,
  mockMode,
  fusionConfig,
  onFrame,
  onDuress,
  onSilentTap,
  onState,
}: NeuroBandBridgeProps) {
  const sustainedRef = useRef(emptySustained());
  const baselinesRef = useRef<NeuroBandBaselines>({ ...EMPTY_BASELINES });
  const lastFireAt = useRef(0);
  const baselinesPersistAt = useRef(0);

  // Latest config — read inside the BLE callback, which is created once.
  const cfgRef = useRef(fusionConfig);
  useEffect(() => {
    cfgRef.current = fusionConfig;
  }, [fusionConfig]);

  // Hydrate baselines once when this bridge mounts.
  useEffect(() => {
    let alive = true;
    void loadBaselines().then((b) => {
      if (alive) baselinesRef.current = b;
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      onState('disabled');
      return;
    }

    let cancelled = false;
    let sub: BioSubscription | null = null;

    const handleFrame = (frame: BioFrame) => {
      if (cancelled) return;

      // Update baselines (Welford / EMA).
      const newBaselines = updateBaselines(baselinesRef.current, frame);
      baselinesRef.current = newBaselines;
      // Persist at most once every 30 s — disk thrash is real on cheap phones.
      if (Date.now() - baselinesPersistAt.current > 30_000) {
        baselinesPersistAt.current = Date.now();
        void saveBaselines(newBaselines);
      }

      // Compute markers + sustained counters.
      const fired = instantMarkers(frame, newBaselines, cfgRef.current.sensitivity);
      sustainedRef.current = updateSustained(sustainedRef.current, fired);

      // Surface the frame to the provider for live UI.
      onFrame(frame);

      // Run the fusion check.
      const verdict = fuse({
        frame,
        baselines: newBaselines,
        config: cfgRef.current,
        now: Date.now(),
        sustained: sustainedRef.current,
      });

      // Debounce: at most one duress fire per 60 s.
      if (verdict.fire && Date.now() - lastFireAt.current > 60_000) {
        lastFireAt.current = Date.now();
        onDuress(verdict.markerBitmap, frame);
      }
    };

    const handleTrigger = () => {
      if (cancelled) return;
      onSilentTap();
    };

    const handleState = (state: ConnectionState, info?: string) => {
      if (cancelled) return;
      onState(state, info);
    };

    void (async () => {
      try {
        if (mockMode || !isBleNativeAvailable()) {
          sub = startMockStream({
            onFrame: handleFrame,
            onTrigger: handleTrigger,
            onState: handleState,
          });
          return;
        }
        const pair = await loadPairRecord();
        if (!pair) {
          handleState('idle', 'no-pair');
          return;
        }
        const result = await connectAndSubscribe(pair.peripheralId, {
          onFrame: handleFrame,
          onTrigger: handleTrigger,
          onState: handleState,
        });
        if (cancelled) {
          result.subscription.remove();
        } else {
          sub = result.subscription;
        }
      } catch (e) {
        handleState('error', e instanceof Error ? e.message : 'connect failed');
      }
    })();

    return () => {
      cancelled = true;
      if (sub) sub.remove();
    };
  }, [enabled, mockMode, onFrame, onDuress, onSilentTap, onState]);

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

  // NeuroBand live state — re-rendered on every frame, so kept light.
  const [neuroBandState, setNeuroBandState] = useState<NeuroBandLiveState>(
    FALLBACK_NEUROBAND_STATE,
  );
  const neuroBandBaselinesRef = useRef<NeuroBandBaselines>({ ...EMPTY_BASELINES });
  // Latest bio frame for evidence attachment, read at SOS time.
  const lastBioFrameRef = useRef<BioFrame | null>(null);
  const lastBioMarkersRef = useRef<{ bitmap: number; markers: Marker[] } | null>(
    null,
  );

  useEffect(() => {
    grace.current = graceUntil;
  }, [graceUntil]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [c, s, hasPin, baselines] = await Promise.all([
        loadContacts(),
        loadSettings(),
        Session.getPin(),
        loadBaselines(),
      ]);
      if (!alive) return;
      setContacts(c);
      setSettings(s);
      neuroBandBaselinesRef.current = baselines;
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

  const captureSosEvidence = useCallback(
    async (trigger: string = 'sos') => {
      let session = createEvidenceSession(trigger);
      let lat: number | null = null;
      let lon: number | null = null;
      // Try to attach a location stamp. Fail silently — evidence is best-effort.
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === Location.PermissionStatus.GRANTED) {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          lat = pos.coords.latitude;
          lon = pos.coords.longitude;
          session = addEvidenceItem(session, {
            type: 'location',
            uri: null,
            text: `SOS triggered at ${new Date().toISOString()}`,
            lat,
            lon,
            alertId: null,
            tags: [trigger, 'auto'],
          });
        }
      } catch {
        /* ignore */
      }

      // Attach a bio frame if NeuroBand is involved in this SOS.
      const bio = lastBioFrameRef.current;
      const markers = lastBioMarkersRef.current;
      if (
        bio &&
        (trigger === 'neuroband' ||
          trigger === 'neuroband-cap' ||
          trigger === 'neuroband-tamper')
      ) {
        const bitmap = markers?.bitmap ?? 0;
        const tag =
          markers?.markers && markers.markers.length > 0
            ? `markers:${bitmapToString(bitmap)}`
            : 'markers:00000';
        session = addEvidenceItem(session, {
          type: 'bio',
          uri: null,
          text:
            `NeuroBand duress: HR=${bio.hr} bpm, ` +
            `GSR=${bio.gsrUs.toFixed(2)} µS, ` +
            `temp=${bio.skinTempC.toFixed(1)} °C, ` +
            `motion=${bio.motion}, sEMG=${bio.semg}`,
          lat,
          lon,
          alertId: null,
          tags: [trigger, 'neuroband', tag],
        });
      }

      session = completeEvidenceSession(session);
      await saveEvidenceSession(session);
      if (settings.cloudSyncEvidence) {
        // Background — never blocks the SOS toast.
        void syncSessionAsync(session);
      }
    },
    [settings.cloudSyncEvidence],
  );

  const executeSos = useCallback(async () => {
    // Start siren immediately if enabled — don't wait for SMS
    if (settings.sirenEnabled) {
      startSiren().catch((err) => {
        console.warn('[sos] siren failed to start:', err);
      });
    }

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
    void captureSosEvidence('sos');
    return r;
  }, [contacts, settings, captureSosEvidence]);

  /**
   * Silent SOS path used by NeuroBand. Skips siren + alerts, sends SMS,
   * captures bio-attached evidence, auto-calls if configured. Single haptic
   * confirmation only — felt, not seen.
   */
  const triggerNeuroBandSos = useCallback(
    async (reason: string) => {
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } catch {
        /* ignore */
      }
      const r = await sendSosSms(contacts, settings);
      if (r.ok && settings.autoCallAfterSms) {
        await dialEmergency(settings.emergencyNumber);
      }
      void captureSosEvidence(reason);
      void appendEvent({
        ts: Date.now(),
        kind: 'fire',
        markers: lastBioMarkersRef.current?.bitmap ?? 0,
        hr: lastBioFrameRef.current?.hr,
        gsrUs: lastBioFrameRef.current?.gsrUs,
        skinTempC: lastBioFrameRef.current?.skinTempC,
        motion: lastBioFrameRef.current?.motion,
        note: r.ok ? r.message : `SMS failed: ${r.message}`,
      });
    },
    [contacts, settings, captureSosEvidence],
  );

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
        // Set both the ref AND the state synchronously. The ref prevents
        // this branch from re-firing on the next tick before React has had
        // a chance to flush the state update through useEffect.
        grace.current = newGrace;
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
        // Grace expired — auto-fire and clear. Clear the ref synchronously
        // so a subsequent tick (before React flushes) can't re-fire SOS.
        grace.current = null;
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

  // ---- NeuroBand handlers ----
  const fusionConfig = useMemo<FusionConfig>(
    () => ({
      sensitivity: settings.neuroBandSensitivity,
      calibrationWindowMs: 24 * 60 * 60 * 1000,
      workoutModeUntil: settings.neuroBandWorkoutModeUntil,
    }),
    [settings.neuroBandSensitivity, settings.neuroBandWorkoutModeUntil],
  );

  const onNeuroFrame = useCallback((frame: BioFrame) => {
    lastBioFrameRef.current = frame;
    const fired = instantMarkers(
      frame,
      neuroBandBaselinesRef.current,
      'normal', // sensitivity for live UI; fusion engine uses settings value
    );
    setNeuroBandState((prev) => ({
      ...prev,
      lastFrame: frame,
      instant: fired,
      sustained: prev.sustained, // sustained is updated in the bridge; mirror here on next frame
      calibrationProgress: Math.min(
        1,
        neuroBandBaselinesRef.current.hrRestN / 3600,
      ),
      workoutModeActive:
        !!settings.neuroBandWorkoutModeUntil &&
        Date.now() < settings.neuroBandWorkoutModeUntil,
    }));
  }, [settings.neuroBandWorkoutModeUntil]);

  const onNeuroDuress = useCallback(
    (markerBitmap: number, frame: BioFrame) => {
      lastBioFrameRef.current = frame;
      const markers: Marker[] = [];
      const all: Marker[] = ['hr', 'gsr', 'temp', 'spo2', 'semg'];
      all.forEach((m, i) => {
        if ((markerBitmap >> i) & 1) markers.push(m);
      });
      lastBioMarkersRef.current = { bitmap: markerBitmap, markers };
      void triggerNeuroBandSos('neuroband');
    },
    [triggerNeuroBandSos],
  );

  const onNeuroSilentTap = useCallback(() => {
    // Capacitive override always fires SOS, even during workout-mode or
    // calibration — it's the user's manual fallback.
    void appendEvent({ ts: Date.now(), kind: 'cap-tap' });
    lastBioMarkersRef.current = null;
    void triggerNeuroBandSos('neuroband-cap');
  }, [triggerNeuroBandSos]);

  const onNeuroState = useCallback((state: ConnectionState) => {
    setNeuroBandState((prev) => ({ ...prev, connection: state }));
  }, []);

  const externalTriggerNeuroBandSos = useCallback(
    async (reason: string) => {
      await triggerNeuroBandSos(reason);
    },
    [triggerNeuroBandSos],
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
      locked,
      unlock,
      startCheckIn,
      cancelCheckIn,
      neuroBand: neuroBandState,
      triggerNeuroBandSos: externalTriggerNeuroBandSos,
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
      neuroBandState,
      externalTriggerNeuroBandSos,
    ],
  );

  return (
    <HearMeContext.Provider value={value}>
      <ShakeBridge
        enabled={ready && settings.shakeEnabled}
        instantShake={settings.instantShake}
        onShakeDetected={onShakeDetected}
      />
      <NeuroBandBridge
        enabled={ready && settings.neuroBandEnabled}
        mockMode={settings.neuroBandMockMode}
        fusionConfig={fusionConfig}
        onFrame={onNeuroFrame}
        onDuress={onNeuroDuress}
        onSilentTap={onNeuroSilentTap}
        onState={onNeuroState}
      />
      {children}
    </HearMeContext.Provider>
  );
}
