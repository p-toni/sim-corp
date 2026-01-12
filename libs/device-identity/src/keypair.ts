import { generateKeyPair, exportJWK, exportPKCS8, exportSPKI } from "jose";

export interface DeviceKeypair {
  kid: string;
  publicKey: string; // PEM format (SPKI)
  privateKey: string; // PEM format (PKCS8) - empty for HSM keys
  publicKeyJwk: Record<string, unknown>;
  privateKeyJwk: Record<string, unknown>; // empty for HSM keys
  hsmKeyId?: string; // KMS/HSM key ID (for HSM-backed keys)
}

/**
 * Generates a new Ed25519 keypair for a device.
 *
 * @param kid - Key ID in format "device:{machineId}@{siteId}" or similar
 * @returns DeviceKeypair with public/private keys in multiple formats
 */
export async function generateDeviceKeypair(kid: string): Promise<DeviceKeypair> {
  const { publicKey, privateKey } = await generateKeyPair("EdDSA", {
    crv: "Ed25519"
  });

  const [publicKeyPem, privateKeyPem, publicKeyJwk, privateKeyJwk] = await Promise.all([
    exportSPKI(publicKey),
    exportPKCS8(privateKey),
    exportJWK(publicKey),
    exportJWK(privateKey)
  ]);

  return {
    kid,
    publicKey: publicKeyPem,
    privateKey: privateKeyPem,
    publicKeyJwk,
    privateKeyJwk
  };
}
