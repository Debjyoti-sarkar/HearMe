/**
 * Single mount point for the voice guide UI: floating mic + command modal.
 * Lives at the (main) layout level so every main screen gets it for free.
 *
 * Bottom offset uses safe-area inset + a small tab-bar guess. This works
 * across the tabs and the modal stacks without coupling to react-navigation.
 */
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VoiceCommandModal } from './VoiceCommandModal';
import { VoiceGuideButton } from './VoiceGuideButton';

const TAB_BAR_GUESS = 64;

export function VoiceGuideOverlay() {
  const insets = useSafeAreaInsets();
  const bottom =
    Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 10) +
    TAB_BAR_GUESS;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <VoiceGuideButton bottomOffset={bottom} />
      <VoiceCommandModal />
    </View>
  );
}
