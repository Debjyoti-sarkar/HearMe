import * as Location from 'expo-location';
import * as SMS from 'expo-sms';
import { Linking, Platform } from 'react-native';

import type { EmergencyContact, HearMeSettings } from './types';

export type EmergencyResult = { ok: boolean; message: string };

function phoneList(contacts: EmergencyContact[]): string[] {
  return contacts
    .map((c) => c.phone.replace(/\D/g, ''))
    .filter((p) => p.length >= 8);
}

async function resolveLocationLine(): Promise<string> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== Location.PermissionStatus.GRANTED) {
    return 'Location permission not granted — please call me.';
  }
  const service = await Location.hasServicesEnabledAsync();
  if (!service) {
    return 'Location services are off on my phone.';
  }
  try {
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Highest,
    });
    const { latitude, longitude, accuracy } = pos.coords;
    const url = `https://maps.google.com/?q=${latitude},${longitude}`;
    return `GPS: ${url} (accuracy ~${accuracy?.toFixed?.(0) ?? '?'}m)`;
  } catch {
    return 'Could not read GPS in time — please try calling me.';
  }
}

export async function sendSosSms(
  contacts: EmergencyContact[],
  _settings: HearMeSettings,
): Promise<EmergencyResult> {
  const phones = phoneList(contacts);
  if (phones.length === 0) {
    return { ok: false, message: 'Add at least one trusted contact with a valid number.' };
  }
  const available = await SMS.isAvailableAsync();
  if (!available) {
    return { ok: false, message: 'SMS is not available on this device.' };
  }
  const loc = await resolveLocationLine();
  const body = `EMERGENCY (HearMe): I need help now.\n${loc}\nPlease try calling me if SMS fails.\n— HearMe`;
  try {
    const { result } = await SMS.sendSMSAsync(phones, body);
    if (result === 'sent' || result === 'cancelled') {
      return {
        ok: true,
        message:
          result === 'cancelled'
            ? 'SMS composer was opened or cancelled.'
            : 'Emergency SMS sent to your trusted contacts.',
      };
    }
    return { ok: false, message: `SMS could not complete (${result}).` };
  } catch (e) {
    return { ok: false, message: `SMS failed: ${String(e)}` };
  }
}

export async function shareLocationSms(contacts: EmergencyContact[]): Promise<EmergencyResult> {
  const phones = phoneList(contacts);
  if (phones.length === 0) {
    return { ok: false, message: 'Add a trusted contact first.' };
  }
  const available = await SMS.isAvailableAsync();
  if (!available) {
    return { ok: false, message: 'SMS is not available on this device.' };
  }
  const loc = await resolveLocationLine();
  const body = `HearMe — sharing my location (non-emergency):\n${loc}`;
  try {
    const { result } = await SMS.sendSMSAsync(phones, body);
    if (result === 'sent' || result === 'cancelled') {
      return { ok: true, message: 'Location SMS sent or composer opened.' };
    }
    return { ok: false, message: `Could not send (${result}).` };
  } catch (e) {
    return { ok: false, message: String(e) };
  }
}

export async function getLocationText(): Promise<string> {
  return resolveLocationLine();
}

export async function shareLocationWhatsApp(): Promise<EmergencyResult> {
  const loc = await resolveLocationLine();
  const body = encodeURIComponent(`HearMe — sharing my location:\n${loc}`);
  const url = `whatsapp://send?text=${body}`;
  try {
    const can = await Linking.canOpenURL(url);
    if (!can) {
      return { ok: false, message: 'WhatsApp is not installed on this device.' };
    }
    await Linking.openURL(url);
    return { ok: true, message: 'WhatsApp opened with your location.' };
  } catch (e) {
    return { ok: false, message: `WhatsApp failed: ${String(e)}` };
  }
}

export async function dialEmergency(raw: string): Promise<void> {
  const cleaned = raw.replace(/[^\d+]/g, '');
  if (!cleaned) return;
  const uri = `tel:${cleaned}`;
  const can = await Linking.canOpenURL(uri);
  if (can) await Linking.openURL(uri);
  else if (Platform.OS === 'android') {
    await Linking.openURL(uri);
  }
}
