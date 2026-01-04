import { DeviceKeyStore, verifyTelemetry } from "@sim-corp/device-identity";
import type { TelemetryEnvelope } from "@sim-corp/schemas";

export interface VerificationResult {
  verified: boolean;
  kid?: string;
  error?: string;
}

/**
 * Verifies the signature on a telemetry envelope.
 * Returns verification status and optionally the kid if signature is valid.
 */
export class SignatureVerifier {
  constructor(private readonly keystore: DeviceKeyStore) {}

  async verify(envelope: TelemetryEnvelope): Promise<VerificationResult> {
    // If no signature, mark as unverified (not an error)
    if (!envelope.sig || !envelope.kid) {
      return { verified: false };
    }

    try {
      // Load the device's public key
      const keypair = await this.keystore.load(envelope.kid);
      if (!keypair) {
        return {
          verified: false,
          error: `Unknown device key: ${envelope.kid}`
        };
      }

      // Verify the signature
      await verifyTelemetry(envelope.sig, keypair.publicKey, envelope.kid);

      return {
        verified: true,
        kid: envelope.kid
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        verified: false,
        kid: envelope.kid,
        error: `Signature verification failed: ${message}`
      };
    }
  }
}
