/**
 * GestureTracker
 * Wraps child content and silently captures tap and swipe events for
 * behavioral analysis. Adapted from PhishSafe SDK's GestureWrapper.
 *
 * This component does NOT interfere with normal touch handling — it uses
 * a transparent overlay that passes all touches through via pointerEvents="box-none".
 */

import { useRef, type ReactNode } from 'react';
import {
  Dimensions,
  type GestureResponderEvent,
  View,
} from 'react-native';

import {
  type BehaviorSession,
  addTapEvent,
  addSwipeEvent,
  detectTapZone,
  getActiveSession,
  saveActiveSession,
} from '../lib/behavior-tracker';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const MIN_SWIPE_DISTANCE = 30;

type Props = {
  children: ReactNode;
};

export function GestureTracker({ children }: Props) {
  const touchStart = useRef<{ x: number; y: number; time: number } | null>(null);

  const handleTouchStart = (e: GestureResponderEvent) => {
    const { pageX, pageY } = e.nativeEvent;
    touchStart.current = { x: pageX, y: pageY, time: Date.now() };
  };

  const handleTouchEnd = (e: GestureResponderEvent) => {
    const start = touchStart.current;
    if (!start) return;
    touchStart.current = null;

    const { pageX, pageY } = e.nativeEvent;
    const endTime = Date.now();
    const durationMs = endTime - start.time;
    const dx = pageX - start.x;
    const dy = pageY - start.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Fire-and-forget async update
    void (async () => {
      const session = await getActiveSession();
      if (!session) return;

      let updated: BehaviorSession;

      if (distance < MIN_SWIPE_DISTANCE) {
        // It's a tap
        const zone = detectTapZone(pageX, pageY, SCREEN_W, SCREEN_H);
        updated = addTapEvent(session, {
          timestamp: endTime,
          x: Math.round(pageX),
          y: Math.round(pageY),
          zone,
          durationMs,
        });
      } else {
        // It's a swipe
        const speedPxPerMs = durationMs > 0 ? distance / durationMs : 0;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        let direction: 'up' | 'down' | 'left' | 'right';
        if (absDx > absDy) {
          direction = dx > 0 ? 'right' : 'left';
        } else {
          direction = dy > 0 ? 'down' : 'up';
        }
        updated = addSwipeEvent(session, {
          timestamp: endTime,
          direction,
          distancePx: Math.round(distance),
          speedPxPerMs: Math.round(speedPxPerMs * 100) / 100,
          durationMs,
        });
      }

      await saveActiveSession(updated);
    })();
  };

  return (
    <View
      style={{ flex: 1 }}
      onStartShouldSetResponderCapture={() => {
        // We capture the start but return false to not steal the gesture
        return false;
      }}
      onMoveShouldSetResponderCapture={() => false}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      pointerEvents="box-none"
    >
      {children}
    </View>
  );
}
