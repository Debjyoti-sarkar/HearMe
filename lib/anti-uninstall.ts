// Anti-uninstall guard.
//
// An attacker holding the phone may try to uninstall HearMe to silence the
// SOS / journey monitor. Two platform paths exist:
//
//   Android — declare HearMe as a Device Admin app. Once enabled, uninstall
//             is gated behind disabling Device Admin first, and we can require
//             the duress PIN at that step. The native side is a Java module
//             extending DeviceAdminReceiver.
//
//   iOS    — Apple does not let third-party apps prevent their own removal.
//             Best we can do is lean on Screen Time restrictions, which the
//             user (or guardian) configures once. We deep-link them to the
//             relevant Settings page.
//
// This module exposes a JS-side adapter interface plus deep-links to the
// platform settings screens. The default backend is a no-op that returns
// "not enabled" so the UI never lies. Callers wire the real native module
// via {@link registerAntiUninstallBackend}.

import { Linking, Platform } from 'react-native';

export type GuardStatus = {
  supported: boolean;
  enabled: boolean;
  /** Platform-specific human-readable note, e.g. "Device Admin active". */
  detail: string;
};

export type AntiUninstallBackend = {
  status(): Promise<GuardStatus>;
  /** Open the OS surface where the user enables/disables the protection. */
  openSettings(): Promise<void>;
  /** Best-effort enable. May open OS Settings on Android; iOS always returns false. */
  requestEnable(): Promise<boolean>;
  /** Disable — should require a duress-PIN re-entry first. */
  requestDisable(duressPin: string): Promise<boolean>;
};

const NOOP_BACKEND: AntiUninstallBackend = {
  async status() {
    return {
      supported: false,
      enabled: false,
      detail: 'No native bridge installed (this build).',
    };
  },
  async openSettings() {
    if (Platform.OS === 'android') {
      try {
        await Linking.openSettings();
      } catch {
        /* ignore */
      }
      return;
    }
    if (Platform.OS === 'ios') {
      try {
        await Linking.openURL('app-settings:');
      } catch {
        /* ignore */
      }
    }
  },
  async requestEnable() {
    return false;
  },
  async requestDisable() {
    return false;
  },
};

let backend: AntiUninstallBackend = NOOP_BACKEND;

export function registerAntiUninstallBackend(b: AntiUninstallBackend): void {
  backend = b;
}

export async function getGuardStatus(): Promise<GuardStatus> {
  return backend.status();
}

export async function openGuardSettings(): Promise<void> {
  return backend.openSettings();
}

export async function requestEnableGuard(): Promise<boolean> {
  return backend.requestEnable();
}

export async function requestDisableGuard(duressPin: string): Promise<boolean> {
  return backend.requestDisable(duressPin);
}

/**
 * Native-side recipe for Android Device Admin.
 *
 * 1. Add to android/app/src/main/AndroidManifest.xml:
 *
 *    <receiver
 *      android:name=".HearMeDeviceAdminReceiver"
 *      android:label="@string/app_name"
 *      android:permission="android.permission.BIND_DEVICE_ADMIN"
 *      android:exported="true">
 *      <meta-data
 *        android:name="android.app.device_admin"
 *        android:resource="@xml/device_admin" />
 *      <intent-filter>
 *        <action android:name="android.app.action.DEVICE_ADMIN_ENABLED" />
 *      </intent-filter>
 *    </receiver>
 *
 * 2. Create android/app/src/main/res/xml/device_admin.xml with:
 *
 *    <device-admin xmlns:android="http://schemas.android.com/apk/res/android">
 *      <uses-policies>
 *        <force-lock />
 *      </uses-policies>
 *    </device-admin>
 *
 * 3. HearMeDeviceAdminReceiver.kt:
 *
 *    class HearMeDeviceAdminReceiver : DeviceAdminReceiver()
 *
 * 4. JS bridge module (TurboModule or legacy) implements AntiUninstallBackend:
 *      - status: DevicePolicyManager.isAdminActive(componentName)
 *      - requestEnable: launch Intent ACTION_ADD_DEVICE_ADMIN
 *      - requestDisable: validate duressPin, then DevicePolicyManager.removeActiveAdmin()
 *
 * iOS recipe: Family Controls / Screen Time API requires the
 * com.apple.developer.family-controls entitlement and is gated to apps with
 * a "supervised devices" use case. Pragmatic alternative: instruct the user
 * to set up Screen Time → Restrictions → Allow / Don't Allow Changes →
 * Deleting Apps = Don't Allow. Provide a deep-link to that page.
 */
export const NATIVE_RECIPE = '__see lib/anti-uninstall.ts source for full Android + iOS recipe__';
