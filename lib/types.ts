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
};
