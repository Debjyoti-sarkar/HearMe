export type EmergencyContact = {
  id: string;
  name: string;
  phone: string;
};

export type HearMeSettings = {
  shakeEnabled: boolean;
  instantShake: boolean;
  skipSosConfirm: boolean;
  autoCallAfterSms: boolean;
  emergencyNumber: string;
};

export const DEFAULT_SETTINGS: HearMeSettings = {
  shakeEnabled: false,
  instantShake: false,
  skipSosConfirm: false,
  autoCallAfterSms: false,
  emergencyNumber: '112',
};
