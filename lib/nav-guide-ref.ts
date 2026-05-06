/**
 * Tiny module-level singleton for the NavigationGuide imperative ref.
 *
 * Avoids threading another context through the provider tree just to let
 * Settings re-trigger the home-screen guide.
 */
import type { MutableRefObject } from 'react';
import type { NavigationGuideHandle } from '../components/NavigationGuide';

const ref: MutableRefObject<NavigationGuideHandle | null> = { current: null };

export function setNavGuideRef(handle: NavigationGuideHandle | null): void {
  ref.current = handle;
}

export function openNavGuide(): boolean {
  if (!ref.current) return false;
  ref.current.open();
  return true;
}
