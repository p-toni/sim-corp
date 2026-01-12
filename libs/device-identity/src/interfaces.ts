import type { DeviceKeypair } from "./keypair";
import type { SignedPayload } from "./signing";

/**
 * Abstract interface for device key storage.
 * Implementations can be file-based (dev), HSM-based (production), or cloud KMS.
 */
export interface IKeyStore {
  /**
   * Generates and stores a new device keypair.
   * @param kid - Key ID in format "device:{machineId}@{siteId}"
   * @returns The generated keypair (may not include private key for HSM)
   */
  generateAndStore(kid: string): Promise<DeviceKeypair>;

  /**
   * Loads the public key for a device.
   * @param kid - Key ID
   * @returns Public key data or null if not found
   */
  loadPublicKey(kid: string): Promise<Pick<DeviceKeypair, "kid" | "publicKey" | "publicKeyJwk"> | null>;

  /**
   * Lists all stored key IDs.
   * @returns Array of key IDs
   */
  listKids(): Promise<string[]>;

  /**
   * Gets or creates a device keypair.
   * @param kid - Key ID
   * @returns The keypair (may not include private key for HSM)
   */
  getOrCreate(kid: string): Promise<DeviceKeypair>;

  /**
   * Rotates a device key (generates new key, deprecates old).
   * @param kid - Key ID to rotate
   * @returns The new keypair
   */
  rotate?(kid: string): Promise<DeviceKeypair>;
}

/**
 * Abstract interface for signing telemetry payloads.
 * Implementations can use local keys (dev) or HSM/KMS (production).
 */
export interface ISigner {
  /**
   * Signs a telemetry payload.
   * @param payload - The telemetry data to sign
   * @param kid - Key ID to use for signing
   * @returns Signed payload with compact JWT signature
   */
  sign(payload: Record<string, unknown>, kid: string): Promise<SignedPayload>;

  /**
   * Gets the audit log entries for signing operations (HSM only).
   * @returns Array of audit log entries or empty array if not supported
   */
  getAuditLog?(): Promise<AuditLogEntry[]>;
}

/**
 * Audit log entry for HSM operations.
 */
export interface AuditLogEntry {
  timestamp: string;
  operation: "SIGN" | "GENERATE_KEY" | "ROTATE_KEY" | "LOAD_KEY";
  kid: string;
  success: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Configuration for keystore and signer.
 */
export interface DeviceIdentityConfig {
  /** Keystore mode: 'file' for dev, 'hsm' for production */
  mode: "file" | "hsm";

  /** File-based keystore path (for mode='file') */
  keystorePath?: string;

  /** HSM provider (for mode='hsm') */
  hsmProvider?: "aws-kms" | "gcp-kms" | "azure-keyvault";

  /** HSM configuration (provider-specific) */
  hsmConfig?: {
    region?: string;
    keyId?: string;
    credentials?: {
      accessKeyId?: string;
      secretAccessKey?: string;
    };
  };

  /** Enable audit logging for all operations */
  auditLogging?: boolean;
}
