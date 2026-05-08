// Type shims for @noble crypto packages.
// These are added to package.json deps; until `npm install` runs, the
// shims keep `tsc --noEmit` clean. Real types ship with the packages.

declare module '@noble/ed25519' {
  // Hash-injection points across versions — at runtime we set whichever the
  // bundled package exposes. The shim declares all three as optional so the
  // module works regardless of which @noble/ed25519 release npm resolves to.
  export const etc: {
    sha512Async?: (...m: Uint8Array[]) => Promise<Uint8Array>;
    sha512Sync?: (...m: Uint8Array[]) => Uint8Array;
  } | undefined;
  export const hashes: {
    sha512?: (msg: Uint8Array) => Promise<Uint8Array>;
  } | undefined;
  export const utils: {
    sha512?: (msg: Uint8Array) => Promise<Uint8Array> | Uint8Array;
  } | undefined;
  export function getPublicKeyAsync(secretKey: Uint8Array): Promise<Uint8Array>;
  export function signAsync(msg: Uint8Array, secretKey: Uint8Array): Promise<Uint8Array>;
  export function verifyAsync(
    sig: Uint8Array,
    msg: Uint8Array,
    publicKey: Uint8Array,
  ): Promise<boolean>;
}

declare module '@noble/ciphers/aes' {
  export interface AesGcm {
    encrypt(plaintext: Uint8Array): Uint8Array;
    decrypt(ciphertext: Uint8Array): Uint8Array;
  }
  export function gcm(key: Uint8Array, nonce: Uint8Array): AesGcm;
}
