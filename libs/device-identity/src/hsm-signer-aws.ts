import { KMSClient, SignCommand } from "@aws-sdk/client-kms";
import { SignJWT, importSPKI } from "jose";
import type { ISigner, AuditLogEntry } from "./interfaces";
import type { SignedPayload } from "./signing";
import type { IKeyStore } from "./interfaces";

/**
 * AWS KMS-backed signer for production device identity.
 * Signs telemetry payloads using ECDSA P-256 keys in KMS.
 * Private keys never leave the HSM.
 */
export class AwsKmsSigner implements ISigner {
  private kmsClient: KMSClient;
  private auditLog: AuditLogEntry[] = [];

  constructor(
    private readonly keystore: IKeyStore,
    private readonly config: {
      region: string;
      credentials?: {
        accessKeyId: string;
        secretAccessKey: string;
      };
      enableAuditLogging?: boolean;
    }
  ) {
    this.kmsClient = new KMSClient({
      region: config.region,
      credentials: config.credentials
    });
  }

  async sign(payload: Record<string, unknown>, kid: string): Promise<SignedPayload> {
    const startTime = Date.now();
    let success = false;
    let error: string | undefined;

    try {
      // Get key ID from keystore (either full keypair or just public key with hsmKeyId)
      const keypair = await (this.keystore as any).getOrCreate(kid);
      const keyId = keypair.hsmKeyId || `alias/device/${kid.replace(/[^a-zA-Z0-9-_]/g, "-")}`;

      // Create JWT header and payload
      const header = {
        alg: "ES256" as const, // ECDSA P-256
        kid
      };

      const now = Math.floor(Date.now() / 1000);
      const jwtPayload = {
        ...payload,
        iat: now,
        exp: now + 300 // 5 minutes expiration
      };

      // Encode header and payload
      const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
      const encodedPayload = Buffer.from(JSON.stringify(jwtPayload)).toString("base64url");
      const signingInput = `${encodedHeader}.${encodedPayload}`;

      // Sign with KMS
      const signResult = await this.kmsClient.send(
        new SignCommand({
          KeyId: keyId,
          Message: Buffer.from(signingInput),
          MessageType: "RAW",
          SigningAlgorithm: "ECDSA_SHA_256"
        })
      );

      if (!signResult.Signature) {
        throw new Error("KMS signing failed: no signature returned");
      }

      // Convert DER signature to JWT format (R || S concatenation)
      const derSignature = Buffer.from(signResult.Signature);
      const jwtSignature = this.derToJwtSignature(derSignature);

      // Construct compact JWT
      const compactJwt = `${signingInput}.${jwtSignature}`;

      success = true;

      return {
        payload,
        sig: compactJwt,
        kid
      };
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      if (this.config.enableAuditLogging) {
        this.auditLog.push({
          timestamp: new Date().toISOString(),
          operation: "SIGN",
          kid,
          success,
          error,
          metadata: {
            duration: Date.now() - startTime
          }
        });
      }
    }
  }

  async getAuditLog(): Promise<AuditLogEntry[]> {
    return [...this.auditLog];
  }

  /**
   * Converts DER-encoded ECDSA signature to JWT format (R || S).
   * AWS KMS returns signatures in DER format, but JWTs expect raw R || S.
   */
  private derToJwtSignature(derSignature: Buffer): string {
    // DER structure for ECDSA signature:
    // 0x30 [total-length] 0x02 [r-length] [r-bytes] 0x02 [s-length] [s-bytes]

    let offset = 0;

    // Check SEQUENCE tag
    if (derSignature[offset++] !== 0x30) {
      throw new Error("Invalid DER signature: missing SEQUENCE tag");
    }

    // Skip total length
    offset++;

    // Read R value
    if (derSignature[offset++] !== 0x02) {
      throw new Error("Invalid DER signature: missing INTEGER tag for R");
    }
    const rLength = derSignature[offset++];
    let rBytes = derSignature.slice(offset, offset + rLength);
    offset += rLength;

    // Remove leading zero byte if present (DER encoding for positive integers)
    if (rBytes[0] === 0x00 && rBytes.length > 32) {
      rBytes = rBytes.slice(1);
    }

    // Pad to 32 bytes if needed (P-256 signature components are 32 bytes)
    if (rBytes.length < 32) {
      const padded = Buffer.alloc(32);
      rBytes.copy(padded, 32 - rBytes.length);
      rBytes = padded;
    }

    // Read S value
    if (derSignature[offset++] !== 0x02) {
      throw new Error("Invalid DER signature: missing INTEGER tag for S");
    }
    const sLength = derSignature[offset++];
    let sBytes = derSignature.slice(offset, offset + sLength);

    // Remove leading zero byte if present
    if (sBytes[0] === 0x00 && sBytes.length > 32) {
      sBytes = sBytes.slice(1);
    }

    // Pad to 32 bytes if needed
    if (sBytes.length < 32) {
      const padded = Buffer.alloc(32);
      sBytes.copy(padded, 32 - sBytes.length);
      sBytes = padded;
    }

    // Concatenate R || S and base64url encode
    const rawSignature = Buffer.concat([rBytes, sBytes]);
    return rawSignature.toString("base64url");
  }
}
