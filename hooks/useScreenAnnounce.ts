/**
 * Announce a screen via the voice guide whenever it gains focus.
 *
 * Usage from any expo-router screen:
 *
 *   useScreenAnnounce('screenHome', 'hintHome');
 */
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { useVoiceGuide } from '../providers/VoiceGuideProvider';
import type { VoiceStringKey } from '../lib/voice-guide';

export function useScreenAnnounce(
  screenKey: VoiceStringKey,
  hintKey?: VoiceStringKey | null,
): void {
  const { announceScreen } = useVoiceGuide();
  useFocusEffect(
    useCallback(() => {
      announceScreen(screenKey, hintKey ?? null);
      return () => undefined;
    }, [announceScreen, screenKey, hintKey]),
  );
}
