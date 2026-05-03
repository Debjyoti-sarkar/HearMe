import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type RecordingEntry = {
  id: string;
  uri: string;
  duration: number;
  timestamp: string;
  label: string;
};

const KEY = '@hearme/recordings_v1';

let currentRecording: Audio.Recording | null = null;

export async function startRecording(): Promise<boolean> {
  try {
    const { granted } = await Audio.requestPermissionsAsync();
    if (!granted) return false;

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const recording = new Audio.Recording();
    await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    await recording.startAsync();
    currentRecording = recording;
    return true;
  } catch {
    return false;
  }
}

export async function stopRecording(): Promise<RecordingEntry | null> {
  const recording = currentRecording;
  if (!recording) return null;
  currentRecording = null;

  // Snapshot duration BEFORE stop+unload — getStatusAsync after unload throws
  // on some Android builds because the native object is already disposed.
  let durationMs = 0;
  try {
    const status = await recording.getStatusAsync();
    durationMs = status.durationMillis ?? 0;
  } catch {
    /* ignore — we'll save with duration 0 */
  }

  let uri: string | null = null;
  try {
    await recording.stopAndUnloadAsync();
    uri = recording.getURI();
  } catch (err) {
    console.warn('[audio-recorder] stopAndUnload failed:', err);
    // Try to recover the URI even if unload threw
    try {
      uri = recording.getURI();
    } catch {
      /* ignore */
    }
  }

  try {
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
  } catch {
    /* ignore */
  }

  if (!uri) return null;

  const entry: RecordingEntry = {
    id: `rec-${Date.now()}`,
    uri,
    duration: durationMs,
    timestamp: new Date().toISOString(),
    label: `Recording ${new Date().toLocaleString()}`,
  };

  try {
    const history = await loadRecordings();
    history.unshift(entry);
    await AsyncStorage.setItem(KEY, JSON.stringify(history.slice(0, 30)));
  } catch (err) {
    console.warn('[audio-recorder] failed to persist recording entry:', err);
  }

  return entry;
}

export function isRecording(): boolean {
  return currentRecording !== null;
}

export async function loadRecordings(): Promise<RecordingEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecordingEntry[];
  } catch {
    return [];
  }
}

export async function deleteRecording(id: string): Promise<void> {
  const recs = await loadRecordings();
  const filtered = recs.filter((r) => r.id !== id);
  await AsyncStorage.setItem(KEY, JSON.stringify(filtered));
}

export async function playRecording(uri: string): Promise<Audio.Sound | null> {
  try {
    const { sound } = await Audio.Sound.createAsync({ uri });
    await sound.playAsync();
    return sound;
  } catch {
    return null;
  }
}
