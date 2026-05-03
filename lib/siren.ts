import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';

let sirenInterval: ReturnType<typeof setInterval> | null = null;
let hapticInterval: ReturnType<typeof setInterval> | null = null;
let isPlaying = false;
let sound: Audio.Sound | null = null;

/**
 * Starts a loud siren alarm with haptic feedback.
 * Uses expo-av to play a continuous alarm tone at max volume.
 */
export async function startSiren(): Promise<{ ok: boolean; audio: boolean }> {
  if (isPlaying) return { ok: true, audio: !!sound };
  isPlaying = true;

  let audioOk = false;
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: false,
    });

    const wavData = generateSirenWav();
    const { sound: s } = await Audio.Sound.createAsync(
      { uri: wavData },
      { isLooping: true, volume: 1.0, shouldPlay: true },
    );
    sound = s;
    audioOk = true;
  } catch (err) {
    console.warn('[siren] audio failed, falling back to haptics:', err);
  }

  hapticInterval = setInterval(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }, 600);

  return { ok: true, audio: audioOk };
}

export async function stopSiren(): Promise<void> {
  if (!isPlaying) return;
  isPlaying = false;

  if (hapticInterval) {
    clearInterval(hapticInterval);
    hapticInterval = null;
  }
  if (sirenInterval) {
    clearInterval(sirenInterval);
    sirenInterval = null;
  }
  if (sound) {
    try {
      await sound.stopAsync();
      await sound.unloadAsync();
    } catch {
      /* ignore */
    }
    sound = null;
  }
}

export function isSirenPlaying(): boolean {
  return isPlaying;
}

export function generateSafetyCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

/**
 * Generate a WAV file data URI containing a two-tone siren sound.
 * This avoids needing to bundle an external audio file.
 */
function generateSirenWav(): string {
  const sampleRate = 22050;
  const duration = 4; // seconds (will loop)
  const numSamples = sampleRate * duration;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = numSamples * blockAlign;
  const headerSize = 44;
  const fileSize = headerSize + dataSize;

  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);

  // WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, fileSize - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Generate two-tone siren: alternating between 800Hz and 1200Hz
  const freq1 = 800;
  const freq2 = 1200;
  const switchInterval = sampleRate * 0.5; // switch tone every 0.5s
  const amplitude = 28000; // near-max for 16-bit

  for (let i = 0; i < numSamples; i++) {
    const cycle = Math.floor(i / switchInterval) % 2;
    const freq = cycle === 0 ? freq1 : freq2;
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * freq * t) * amplitude;
    view.setInt16(headerSize + i * 2, Math.round(sample), true);
  }

  // Convert to base64 data URI
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return `data:audio/wav;base64,${base64}`;
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
