/**
 * VoiceGuideProvider — wires the voice-guide engine to the app.
 *
 * Exposes:
 *   - settings (enabled/announceScreens/announceButtons/rate/pitch/intro)
 *   - speak(key | string) — speaks in the user's chosen LangCode
 *   - speakKey(key) — convenience for translated voice-guide strings
 *   - navigate(command) — runs a CommandSpec (route or action)
 *   - openPalette() / closePalette() — controls the command-palette modal
 *   - announceScreen(key) — call from screens onMount/onFocus
 *
 * Settings live in AsyncStorage under HEARME_VOICE_GUIDE_KEY so the choices
 * survive app restarts and don't bloat the existing HearMeSettings shape.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
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

import {
  COMMANDS,
  COMMAND_TO_HINT,
  COMMAND_TO_LABEL,
  COMMAND_TO_SCREEN,
  isSpeechAvailable,
  speak as speakRaw,
  stopSpeaking,
  vt,
  type CommandSpec,
  type VoiceCommand,
  type VoiceStringKey,
} from '../lib/voice-guide';
import { useLanguage } from '../lib/i18n';
import { useHearMe } from './HearMeProvider';

const STORAGE_KEY = 'hearme_voice_guide_v1';

export type VoiceGuideSettings = {
  enabled: boolean;
  announceScreens: boolean;
  announceButtons: boolean;
  speakIntro: boolean;
  rate: number;   // 0.5 .. 1.5
  pitch: number;  // 0.5 .. 1.5
};

const DEFAULTS: VoiceGuideSettings = {
  enabled: true,
  announceScreens: true,
  announceButtons: true,
  speakIntro: true,
  rate: 1.0,
  pitch: 1.0,
};

async function loadSettings(): Promise<VoiceGuideSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      enabled:          typeof parsed.enabled === 'boolean'          ? parsed.enabled          : DEFAULTS.enabled,
      announceScreens:  typeof parsed.announceScreens === 'boolean'  ? parsed.announceScreens  : DEFAULTS.announceScreens,
      announceButtons:  typeof parsed.announceButtons === 'boolean'  ? parsed.announceButtons  : DEFAULTS.announceButtons,
      speakIntro:       typeof parsed.speakIntro === 'boolean'       ? parsed.speakIntro       : DEFAULTS.speakIntro,
      rate:             typeof parsed.rate === 'number'              ? clamp(parsed.rate, 0.5, 1.5)  : DEFAULTS.rate,
      pitch:            typeof parsed.pitch === 'number'             ? clamp(parsed.pitch, 0.5, 1.5) : DEFAULTS.pitch,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

async function saveSettings(s: VoiceGuideSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

type VoiceGuideContextValue = {
  ready: boolean;
  settings: VoiceGuideSettings;
  patchSettings: (p: Partial<VoiceGuideSettings>) => void;

  speechAvailable: boolean;

  /** Speak a translated key in the current language. No-op if guide disabled. */
  speakKey: (key: VoiceStringKey) => void;
  /** Speak any literal string in the current language. */
  speak: (text: string) => void;
  /** Stop whatever is being spoken. */
  stop: () => void;

  /** Announce the screen on focus (uses announceScreens flag + speakIntro flag). */
  announceScreen: (screenKey: VoiceStringKey, hintKey?: VoiceStringKey | null) => void;

  /** Confirmation for key buttons (gated by announceButtons flag). */
  announceAction: (key: VoiceStringKey) => void;

  /** Run a voice command (navigate or perform action). */
  runCommand: (command: VoiceCommand) => void;

  /** All commands (memoized, in display order). */
  commands: CommandSpec[];

  /** Voice palette modal open/close. */
  paletteOpen: boolean;
  openPalette: () => void;
  closePalette: () => void;
};

const VoiceGuideContext = createContext<VoiceGuideContextValue | null>(null);

export function useVoiceGuide(): VoiceGuideContextValue {
  const v = useContext(VoiceGuideContext);
  if (!v) {
    // Outside the provider — return a safe no-op shape so optional callers
    // (e.g. tabs rendered before mount) never crash.
    return {
      ready: false,
      settings: { ...DEFAULTS },
      patchSettings: () => {},
      speechAvailable: false,
      speakKey: () => {},
      speak: () => {},
      stop: () => {},
      announceScreen: () => {},
      announceAction: () => {},
      runCommand: () => {},
      commands: COMMANDS,
      paletteOpen: false,
      openPalette: () => {},
      closePalette: () => {},
    };
  }
  return v;
}

export function VoiceGuideProvider({ children }: { children: ReactNode }) {
  const { lang } = useLanguage();
  const { executeSos, shareLocation, callEmergencyLine, contacts } = useHearMe();

  const [settings, setSettings] = useState<VoiceGuideSettings>(DEFAULTS);
  const [ready, setReady] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const speechAvailable = useMemo(() => isSpeechAvailable(), []);

  // Hydrate persisted settings.
  useEffect(() => {
    let alive = true;
    void loadSettings().then((s) => {
      if (!alive) return;
      setSettings(s);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Stop any in-flight TTS when the app backgrounds — feels broken if
  // playback continues from the home screen after switching away.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next !== 'active') stopSpeaking();
    });
    return () => sub.remove();
  }, []);

  const patchSettings = useCallback((p: Partial<VoiceGuideSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...p };
      if (next.rate !== undefined) next.rate = clamp(next.rate, 0.5, 1.5);
      if (next.pitch !== undefined) next.pitch = clamp(next.pitch, 0.5, 1.5);
      void saveSettings(next);
      return next;
    });
  }, []);

  const langRef = useRef(lang);
  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const speak = useCallback((text: string) => {
    if (!text) return;
    const s = settingsRef.current;
    if (!s.enabled) return;
    stopSpeaking();
    speakRaw(text, {
      lang: langRef.current,
      rate: s.rate,
      pitch: s.pitch,
    });
  }, []);

  const speakKey = useCallback(
    (key: VoiceStringKey) => {
      speak(vt(langRef.current, key));
    },
    [speak],
  );

  const stop = useCallback(() => {
    stopSpeaking();
  }, []);

  const announceScreen = useCallback(
    (screenKey: VoiceStringKey, hintKey?: VoiceStringKey | null) => {
      const s = settingsRef.current;
      if (!s.enabled || !s.announceScreens) return;
      const intro = vt(langRef.current, screenKey);
      const hint = hintKey && s.speakIntro ? '. ' + vt(langRef.current, hintKey) : '';
      speak(intro + hint);
    },
    [speak],
  );

  const announceAction = useCallback(
    (key: VoiceStringKey) => {
      const s = settingsRef.current;
      if (!s.enabled || !s.announceButtons) return;
      speakKey(key);
    },
    [speakKey],
  );

  const runCommand = useCallback(
    (command: VoiceCommand) => {
      const spec = COMMANDS.find((c) => c.command === command);
      if (!spec) return;

      const labelKey = COMMAND_TO_LABEL[command];
      const screenKey = COMMAND_TO_SCREEN[command];
      const l = langRef.current;

      // Speak the destination/action even if announceButtons is off — this is
      // the user explicitly invoking voice; silent feedback would be confusing.
      if (settingsRef.current.enabled) {
        if (spec.route && screenKey) {
          stopSpeaking();
          speakRaw(`${vt(l, 'goingTo')} ${vt(l, screenKey)}`, {
            lang: l,
            rate: settingsRef.current.rate,
            pitch: settingsRef.current.pitch,
          });
        } else {
          stopSpeaking();
          let phraseKey: VoiceStringKey;
          switch (spec.action) {
            case 'sos':           phraseKey = 'sosTriggered';      break;
            case 'shareLocation': phraseKey = 'sharingLocation';   break;
            case 'callEmergency': phraseKey = 'callingEmergency';  break;
            case 'stop':          phraseKey = 'stopped';           break;
            case 'back':          phraseKey = 'goingBack';         break;
            case 'help':          phraseKey = 'helpMessage';       break;
            default:              phraseKey = labelKey;            break;
          }
          if (spec.action !== 'stop') {
            speakRaw(vt(l, phraseKey), {
              lang: l,
              rate: settingsRef.current.rate,
              pitch: settingsRef.current.pitch,
            });
          }
        }
      }

      // Close palette before navigating so the user lands on the destination.
      setPaletteOpen(false);

      if (spec.route) {
        try {
          router.push(spec.route as never);
        } catch {
          /* ignore — route may not be ready yet */
        }
        return;
      }

      switch (spec.action) {
        case 'sos': {
          if (contacts.length === 0) {
            Alert.alert(
              vt(l, 'actionSos'),
              vt(l, 'screenContacts'),
            );
            return;
          }
          void executeSos().then((r) => {
            Alert.alert(r.ok ? 'OK' : '!', r.message);
          });
          return;
        }
        case 'shareLocation': {
          void shareLocation().then((r) => {
            Alert.alert(r.ok ? 'OK' : '!', r.message);
          });
          return;
        }
        case 'callEmergency': {
          void callEmergencyLine();
          return;
        }
        case 'stop': {
          stopSpeaking();
          return;
        }
        case 'back': {
          if (router.canGoBack()) router.back();
          return;
        }
        case 'help':
          // helpMessage was already spoken above.
          return;
        default:
          return;
      }
    },
    [contacts, executeSos, shareLocation, callEmergencyLine],
  );

  const openPalette = useCallback(() => {
    setPaletteOpen(true);
    // Speak a short prompt on open so the user hears voice guide is listening.
    if (settingsRef.current.enabled) {
      speakKey('commandPaletteHint');
    }
  }, [speakKey]);

  const closePalette = useCallback(() => {
    setPaletteOpen(false);
    stopSpeaking();
  }, []);

  const value = useMemo<VoiceGuideContextValue>(
    () => ({
      ready,
      settings,
      patchSettings,
      speechAvailable,
      speakKey,
      speak,
      stop,
      announceScreen,
      announceAction,
      runCommand,
      commands: COMMANDS,
      paletteOpen,
      openPalette,
      closePalette,
    }),
    [
      ready,
      settings,
      patchSettings,
      speechAvailable,
      speakKey,
      speak,
      stop,
      announceScreen,
      announceAction,
      runCommand,
      paletteOpen,
      openPalette,
      closePalette,
    ],
  );

  return (
    <VoiceGuideContext.Provider value={value}>
      {children}
    </VoiceGuideContext.Provider>
  );
}
