import * as Haptics from 'expo-haptics';

let sirenInterval: ReturnType<typeof setInterval> | null = null;
let isPlaying = false;

/**
 * Starts a siren effect using rapid haptic vibrations.
 * For a real audio siren, bundle a .mp3 file and use expo-av.
 */
export async function startSiren(): Promise<void> {
  if (isPlaying) return;
  isPlaying = true;

  // Rapid haptic pulses to simulate siren feedback
  sirenInterval = setInterval(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }, 800);
}

export async function stopSiren(): Promise<void> {
  if (!isPlaying) return;
  if (sirenInterval) {
    clearInterval(sirenInterval);
    sirenInterval = null;
  }
  isPlaying = false;
}

export function isSirenPlaying(): boolean {
  return isPlaying;
}

export function generateSafetyCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}
