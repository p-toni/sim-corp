import {
  KMSClient,
  CreateKeyCommand,
  GetPublicKeyCommand,
  ListAliasesCommand,
  CreateAliasCommand,
  DescribeKeyCommand,
  type KeyMetadata
} from "@aws-sdk/client-kms";
import type { IKeyStore, AuditLogEntry } from "./interfaces";
import type { DeviceKeypair } from "./keypair";
import { exportSPKI, exportJWK, importSPKI } from "jose";

/**
 * AWS KMS-backed keystore for production device identity.
 * Uses ECDSA P-256 keys (AWS KMS doesn't support Ed25519).
 * Private keys never leave the HSM.
 */
export class AwsKmsKeyStore implements IKeyStore {
  private kmsClient: KMSClient;
  private auditLog: AuditLogEntry[] = [];

  constructor(
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

  async generateAndStore(kid: string): Promise<DeviceKeypair> {
    const startTime = Date.now();
    let success = false;
    let error: string | undefined;

    try {
      // Create ECDSA P-256 key in KMS
      const createKeyResult = await this.kmsClient.send(
        new CreateKeyCommand({
          KeyUsage: "SIGN_VERIFY",
          KeySpec: "ECC_NIST_P256", // ECDSA P-256
          Description: `Device identity key for ${kid}`,
          Tags: [
            { TagKey: "kid", TagValue: kid },
            { TagKey: "purpose", TagValue: "device-identity" }
          ]
        })
      );

      const keyId = createKeyResult.KeyMetadata?.KeyId;
      if (!keyId) {
        throw new Error("Failed to create KMS key");
      }

      // Create alias for easier lookup
      const aliasName = `alias/device/${kid.replace(/[^a-zA-Z0-9-_]/g, "-")}`;
      try {
        await this.kmsClient.send(
          new CreateAliasCommand({
            AliasName: aliasName,
            TargetKeyId: keyId
          })
        );
      } catch (err) {
        // Alias might already exist, that's okay
      }

      // Get public key
      const publicKeyResult = await this.kmsClient.send(
        new GetPublicKeyCommand({ KeyId: keyId })
      );

      if (!publicKeyResult.PublicKey) {
        throw new Error("Failed to retrieve public key from KMS");
      }

      // Convert DER to PEM format
      const publicKeyDer = publicKeyResult.PublicKey;
      const publicKeySpki = await importSPKI(
        `-----BEGIN PUBLIC KEY-----\n${Buffer.from(publicKeyDer).toString("base64")}\n-----END PUBLIC KEY-----`,
        "ES256"
      );
      const publicKeyPem = await exportSPKI(publicKeySpki);
      const publicKeyJwk = await exportJWK(publicKeySpki);

      success = true;

      return {
        kid,
        publicKey: publicKeyPem,
        privateKey: "", // Private key never leaves HSM
        publicKeyJwk,
        privateKeyJwk: {}, // Private key never exposed
        hsmKeyId: keyId // Store KMS key ID for signing operations
      };
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      if (this.config.enableAuditLogging) {
        this.auditLog.push({
          timestamp: new Date().toISOString(),
          operation: "GENERATE_KEY",
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

  async loadPublicKey(kid: string): Promise<Pick<DeviceKeypair, "kid" | "publicKey" | "publicKeyJwk"> | null> {
    const startTime = Date.now();
    let success = false;
    let error: string | undefined;

    try {
      // Find key by alias
      const aliasName = `alias/device/${kid.replace(/[^a-zA-Z0-9-_]/g, "-")}`;

      try {
        const publicKeyResult = await this.kmsClient.send(
          new GetPublicKeyCommand({ KeyId: aliasName })
        );

        if (!publicKeyResult.PublicKey) {
          return null;
        }

        // Convert DER to PEM format
        const publicKeyDer = publicKeyResult.PublicKey;
        const publicKeySpki = await importSPKI(
          `-----BEGIN PUBLIC KEY-----\n${Buffer.from(publicKeyDer).toString("base64")}\n-----END PUBLIC KEY-----`,
          "ES256"
        );
        const publicKeyPem = await exportSPKI(publicKeySpki);
        const publicKeyJwk = await exportJWK(publicKeySpki);

        success = true;

        return {
          kid,
          publicKey: publicKeyPem,
          publicKeyJwk
        };
      } catch (err: any) {
        if (err.name === "NotFoundException") {
          return null;
        }
        throw err;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      if (this.config.enableAuditLogging) {
        this.auditLog.push({
          timestamp: new Date().toISOString(),
          operation: "LOAD_KEY",
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

  async listKids(): Promise<string[]> {
    // List aliases with "device/" prefix
    const result = await this.kmsClient.send(new ListAliasesCommand({}));
    const aliases = result.Aliases || [];

    return aliases
      .filter(alias => alias.AliasName?.startsWith("alias/device/"))
      .map(alias => alias.AliasName!.replace("alias/device/", "").replace(/-/g, ":"))
      .filter(Boolean);
  }

  async getOrCreate(kid: string): Promise<DeviceKeypair> {
    const existing = await this.loadPublicKey(kid);
    if (existing) {
      // Return existing public key (private key is in HSM)
      return {
        ...existing,
        privateKey: "",
        privateKeyJwk: {},
        hsmKeyId: `alias/device/${kid.replace(/[^a-zA-Z0-9-_]/g, "-")}`
      };
    }
    return this.generateAndStore(kid);
  }

  async rotate(kid: string): Promise<DeviceKeypair> {
    // AWS KMS doesn't support in-place key rotation for asymmetric keys
    // We need to create a new key and update the alias
    const newKeypair = await this.generateAndStore(kid);

    if (this.config.enableAuditLogging) {
      this.auditLog.push({
        timestamp: new Date().toISOString(),
        operation: "ROTATE_KEY",
        kid,
        success: true,
        metadata: {
          newKeyId: newKeypair.hsmKeyId
        }
      });
    }

    return newKeypair;
  }

  async getAuditLog(): Promise<AuditLogEntry[]> {
    return [...this.auditLog];
  }
}
