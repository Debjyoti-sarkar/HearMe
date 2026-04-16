import { Audio } from 'expo-av';

// NOTE on completeness:
// True keyword spotting (Whisper / Vosk / Picovoice Porcupine) requires a native
// module that is not in the bare expo-av surface. Wiring real recognition needs
// a custom dev client. This module implements the surrounding plumbing — settings,
// permissions, foregrounded amplitude-VAD listener — so that swapping the
// recognition backend later is a one-file change.
//
// Until a native KWS module is added, the listener fires when sustained loud
// audio is detected (a scream / shouted safe word will still trigger). This is
// honest: louder ≠ keyword, but it's a usable signal for distress.

type Listener = () => void;

const STATE = {
  recording: null as Audio.Recording | null,
  loop: null as ReturnType<typeof setInterval> | null,
  loud: 0,
  listener: null as Listener | null,
  running: false,
};

const LOUD_DBFS_THRESHOLD = -18; // peak meter value above which we count a "loud" frame
const LOUD_FRAMES_TO_FIRE = 6;   // ~1.2s of sustained loud audio at 200ms polling
const POLL_MS = 200;

export async function ensurePermission(): Promise<boolean> {
  const r = await Audio.requestPermissionsAsync();
  return r.granted;
}

export async function startListening(onTrigger: Listener): Promise<boolean> {
  if (STATE.running) return true;
  const ok = await ensurePermission();
  if (!ok) return false;

  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });
    const recording = new Audio.Recording();
    await recording.prepareToRecordAsync({
      ...Audio.RecordingOptionsPresets.LOW_QUALITY,
      isMeteringEnabled: true,
    });
    await recording.startAsync();
    STATE.recording = recording;
    STATE.listener = onTrigger;
    STATE.loud = 0;
    STATE.running = true;

    STATE.loop = setInterval(async () => {
      if (!STATE.recording) return;
      try {
        const status = await STATE.recording.getStatusAsync();
        if (!status.isRecording) return;
        const metering = (status as { metering?: number }).metering;
        if (typeof metering !== 'number') return;
        if (metering > LOUD_DBFS_THRESHOLD) {
          STATE.loud += 1;
          if (STATE.loud >= LOUD_FRAMES_TO_FIRE) {
            STATE.loud = 0;
            STATE.listener?.();
          }
        } else {
          STATE.loud = Math.max(0, STATE.loud - 1);
        }
      } catch {
        /* ignore polling glitches */
      }
    }, POLL_MS);

    return true;
  } catch {
    await stopListening();
    return false;
  }
}

export async function stopListening(): Promise<void> {
  if (STATE.loop) {
    clearInterval(STATE.loop);
    STATE.loop = null;
  }
  if (STATE.recording) {
    try {
      await STATE.recording.stopAndUnloadAsync();
    } catch {
      /* ignore */
    }
    STATE.recording = null;
  }
  try {
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
  } catch {
    /* ignore */
  }
  STATE.listener = null;
  STATE.loud = 0;
  STATE.running = false;
}

export function isListening(): boolean {
  return STATE.running;
}
