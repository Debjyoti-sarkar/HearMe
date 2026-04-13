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
  if (!currentRecording) return null;
  try {
    await currentRecording.stopAndUnloadAsync();
    const uri = currentRecording.getURI();
    const status = await currentRecording.getStatusAsync();
    currentRecording = null;

    if (!uri) return null;

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
    });

    const entry: RecordingEntry = {
      id: `rec-${Date.now()}`,
      uri,
      duration: status.durationMillis ?? 0,
      timestamp: new Date().toISOString(),
      label: `Recording ${new Date().toLocaleString()}`,
    };

    const history = await loadRecordings();
    history.unshift(entry);
    await AsyncStorage.setItem(KEY, JSON.stringify(history.slice(0, 30)));

    return entry;
  } catch {
    currentRecording = null;
    return null;
  }
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
