export type EmergencyContact = {
  id: string;
  name: string;
  phone: string;
};

export type UserProfile = {
  id: string;
  name: string | null;
  age: number | null;
  dob: string | null;
  phone: string | null;
  email: string | null;
  location: string | null;
  avatar_url: string | null;
  created_at: string | null;
};

export type HearMeSettings = {
  shakeEnabled: boolean;
  instantShake: boolean;
  skipSosConfirm: boolean;
  autoCallAfterSms: boolean;
  emergencyNumber: string;
  sirenEnabled: boolean;
  crashDetection: boolean;
  crashSpeedThreshold: number;
  onboardingComplete: boolean;
  // Phase-1 additions (PDF roadmap §4 + §5)
  appLockEnabled: boolean;          // require PIN on launch / resume
  duressEnabled: boolean;           // accept reversed PIN as silent SOS
  disguiseEnabled: boolean;         // start in calculator decoy
  voiceTriggerEnabled: boolean;     // listen for safe word
  voiceSafeWord: string;            // user-recorded label
  oneHandedMode: boolean;           // shift content for thumb reach
  dyslexiaFont: boolean;            // accessible font swap
  // Timer check-in (Kitestring) — single active check-in
  activeCheckInExpiresAt: number | null; // epoch ms; null = none
  activeCheckInLabel: string | null;
  // Cloud-synced evidence locker
  cloudSyncEvidence: boolean;       // auto-upload sessions to Supabase
  darkMode: boolean;                // true = dark, false = light
  // NeuroBand — Bio-Signal & Silent Trigger
  neuroBandEnabled: boolean;
  neuroBandSerial: string | null;
  neuroBandWorkoutModeUntil: number | null;
  neuroBandCalibratedAt: number | null;
  neuroBandSensitivity: 'low' | 'normal' | 'high';
  /**
   * Mock mode generates a synthetic BioFrame stream so the UI + fusion engine
   * can be tested without a paired band. Auto-enabled if BLE module isn't built
   * into the running app (Expo Go).
   */
  neuroBandMockMode: boolean;
  /**
   * BBA — Behavioural Biometric Authentication. When enabled, the on-device
   * fraud model continuously scores the active session and prompts for PIN /
   * biometric re-verification when interaction patterns look unusual.
   */
  bbaMonitoringEnabled: boolean;
  /**
   * Override the BBA fraud-probability threshold. 0 uses the value packaged
   * with the model (0.45 from the original BBA paper).
   */
  bbaThresholdOverride: number;
};

export const DEFAULT_SETTINGS: HearMeSettings = {
  shakeEnabled: false,
  instantShake: false,
  skipSosConfirm: false,
  autoCallAfterSms: false,
  emergencyNumber: '112',
  sirenEnabled: true,
  crashDetection: false,
  crashSpeedThreshold: 50,
  onboardingComplete: false,
  appLockEnabled: false,
  duressEnabled: true,
  disguiseEnabled: false,
  voiceTriggerEnabled: false,
  voiceSafeWord: '',
  oneHandedMode: false,
  dyslexiaFont: false,
  activeCheckInExpiresAt: null,
  activeCheckInLabel: null,
  cloudSyncEvidence: false,
  darkMode: true,
  neuroBandEnabled: false,
  neuroBandSerial: null,
  neuroBandWorkoutModeUntil: null,
  neuroBandCalibratedAt: null,
  neuroBandSensitivity: 'normal',
  neuroBandMockMode: false,
  bbaMonitoringEnabled: true,
  bbaThresholdOverride: 0,
};
