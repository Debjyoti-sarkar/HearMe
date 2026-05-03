/**
 * Ambient shim for `react-native-ble-plx` so this project typechecks before
 * the user runs `npm install`. The shim mirrors only the surface area we use
 * in `lib/neuroband-ble.ts`. Once the real package is installed, its bundled
 * types take precedence over this file because TypeScript prefers a shipped
 * .d.ts inside `node_modules` over an ambient module declaration in src.
 *
 * Safe to delete after the first successful `npm install` if you'd like, but
 * leaving it here keeps the project typecheck-clean even if a contributor
 * skips `node_modules`.
 */
declare module 'react-native-ble-plx' {
  export type UUID = string;
  export type DeviceId = string;
  export type Base64 = string;

  export type ScanOptions = {
    allowDuplicates?: boolean;
  };

  export type ConnectionOptions = {
    requestMTU?: number;
    autoConnect?: boolean;
  };

  export type Subscription = {
    remove: () => void;
  };

  export interface Characteristic {
    uuid: UUID;
    value: Base64 | null;
  }

  export interface Device {
    id: DeviceId;
    name: string | null;
    localName: string | null;
    rssi: number | null;
    manufacturerData: Base64 | null;
    discoverAllServicesAndCharacteristics(): Promise<Device>;
    readCharacteristicForService(
      serviceUUID: UUID,
      characteristicUUID: UUID,
    ): Promise<Characteristic>;
    writeCharacteristicWithResponseForService(
      serviceUUID: UUID,
      characteristicUUID: UUID,
      valueBase64: Base64,
    ): Promise<Characteristic>;
    monitorCharacteristicForService(
      serviceUUID: UUID,
      characteristicUUID: UUID,
      listener: (
        error: Error | null,
        characteristic: Characteristic | null,
      ) => void,
    ): Subscription;
    onDisconnected(
      listener: (
        error: { reason?: string; message?: string } | null,
      ) => void,
    ): Subscription;
    cancelConnection(): Promise<Device>;
  }

  export class BleManager {
    constructor();
    startDeviceScan(
      uuids: UUID[] | null,
      options: ScanOptions | null,
      listener: (error: Error | null, device: Device | null) => void,
    ): void;
    stopDeviceScan(): void;
    connectToDevice(
      deviceId: DeviceId,
      options?: ConnectionOptions,
    ): Promise<Device>;
    destroy(): void;
  }
}
