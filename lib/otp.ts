/**
 * Testing / staging: fixed OTP for Expo Go demos.
 * Replace with your SMS provider + server verification before Play Store.
 */
export const DEMO_OTP = '123456';

export function verifyDemoOtp(input: string): boolean {
  return input.replace(/\D/g, '') === DEMO_OTP;
}
