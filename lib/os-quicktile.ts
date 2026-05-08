// OS quick-action surface.
//
// One-press SOS from anywhere in the OS, without unlocking HearMe:
//   • Android — Quick Settings tile (TileService) that the user drags into
//     their notification shade.
//   • iOS 17+ — Action Button (Pro), Control Center widget (iOS 18 lets
//     third-party widgets here), or Siri shortcut. We expose the underlying
//     intent / shortcut handler.
//
// All of these need native code. This file is the JS-side adapter that any
// native bridge plugs into. It also ships a safe fallback: a deep-link URL
// scheme `hearme://sos` that the user can wire into Shortcuts manually
// without writing native code. That deep-link is handled by `app/_layout.tsx`
// to dispatch a real SOS through the standard pipeline.

import { Linking, Platform } from 'react-native';

import { startRelay } from './guardian-relay';
import { loadContacts, loadSettings } from './app-data';

export type QuickTileAction = 'sos' | 'live-share' | 'siren' | 'fake-call';

export type QuickTileBackend = {
  /** True if the platform supports any of our quick surfaces. */
  isSupported(): Promise<boolean>;
  /** Add / refresh the tile or shortcut for an action. */
  install(action: QuickTileAction): Promise<{ ok: boolean; reason?: string }>;
  /** Remove the tile / shortcut. */
  uninstall(action: QuickTileAction): Promise<void>;
  /** Open OS settings page where the user adds the tile / button. */
  openSettings(): Promise<void>;
};

const noopBackend: QuickTileBackend = {
  async isSupported() {
    return false;
  },
  async install() {
    return { ok: false, reason: 'noBackend' };
  },
  async uninstall() {
    /* no-op */
  },
  async openSettings() {
    if (Platform.OS === 'android') {
      try {
        await Linking.openSettings();
      } catch {
        /* ignore */
      }
    } else if (Platform.OS === 'ios') {
      try {
        await Linking.openURL('app-settings:');
      } catch {
        /* ignore */
      }
    }
  },
};

let backend: QuickTileBackend = noopBackend;

export function registerQuickTileBackend(b: QuickTileBackend): void {
  backend = b;
}

export async function quickTileSupported(): Promise<boolean> {
  return backend.isSupported();
}

export async function installQuickTile(
  action: QuickTileAction,
): Promise<{ ok: boolean; reason?: string }> {
  return backend.install(action);
}

export async function uninstallQuickTile(action: QuickTileAction): Promise<void> {
  return backend.uninstall(action);
}

export async function openQuickTileSettings(): Promise<void> {
  return backend.openSettings();
}

/**
 * Deep-link entrypoint shared by all surfaces. Native bridges fire this URL
 * when the user taps the tile / button. Expo-router handles the URL and the
 * app-layout dispatches to {@link handleQuickAction}.
 */
export function quickActionUrl(action: QuickTileAction): string {
  return `hearme://${action}`;
}

/** Dispatch table called from the deep-link handler. */
export async function handleQuickAction(action: QuickTileAction): Promise<void> {
  if (action === 'sos') {
    const [contacts, settings] = await Promise.all([loadContacts(), loadSettings()]);
    if (contacts.length > 0) {
      void startRelay(contacts, settings, () => {
        /* fire-and-forget */
      });
    }
    return;
  }
  // Live-share / siren / fake-call are wired to existing screens via the
  // expo-router `router.push` from `app/_layout.tsx` after handleQuickAction
  // returns. We don't import router here to avoid a circular dependency.
}

/**
 * Recipe for native bridges.
 *
 * Android — TileService skeleton:
 *   class HearMeSosTile : TileService() {
 *     override fun onClick() {
 *       val uri = Uri.parse("hearme://sos")
 *       val intent = Intent(Intent.ACTION_VIEW, uri).addFlags(FLAG_ACTIVITY_NEW_TASK)
 *       startActivityAndCollapse(intent)
 *     }
 *   }
 *   AndroidManifest.xml:
 *     <service android:name=".tiles.HearMeSosTile"
 *              android:icon="@drawable/ic_tile_sos"
 *              android:label="HearMe SOS"
 *              android:permission="android.permission.BIND_QUICK_SETTINGS_TILE"
 *              android:exported="true">
 *       <intent-filter>
 *         <action android:name="android.service.quicksettings.action.QS_TILE" />
 *       </intent-filter>
 *     </service>
 *
 * iOS 17+ — Action Button:
 *   - Bundle a Shortcuts donation that fires a URL: hearme://sos.
 *   - User assigns it to the Action Button in Settings → Action Button.
 *   - For Control Center widgets (iOS 18), use ControlWidget +
 *     ControlWidgetButton with a perform: that returns OpenIntent(url).
 *
 * Siri:
 *   - Donate INStartCallIntent or a custom AppIntent on every successful
 *     SOS. After ~3 fires, Siri suggests "Hey Siri, send SOS".
 */
export const NATIVE_RECIPE = '__see lib/os-quicktile.ts source for full recipe__';
