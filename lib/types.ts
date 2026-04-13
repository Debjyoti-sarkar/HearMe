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
};
