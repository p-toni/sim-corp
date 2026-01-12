import type { IKeyStore, ISigner, DeviceIdentityConfig } from "./interfaces";
import { FileKeyStore } from "./keystore";
import { LocalSigner } from "./local-signer";
import { AwsKmsKeyStore } from "./hsm-keystore-aws";
import { AwsKmsSigner } from "./hsm-signer-aws";

/**
 * Factory for creating keystore and signer instances based on configuration.
 */
export class DeviceIdentityFactory {
  /**
   * Creates a keystore instance based on configuration.
   */
  static createKeyStore(config: DeviceIdentityConfig): IKeyStore {
    if (config.mode === "file") {
      const keystorePath = config.keystorePath || "./var/device-keys";
      return new FileKeyStore(keystorePath);
    }

    if (config.mode === "hsm") {
      if (config.hsmProvider === "aws-kms") {
        if (!config.hsmConfig?.region) {
          throw new Error("AWS KMS requires region configuration");
        }

        return new AwsKmsKeyStore({
          region: config.hsmConfig.region,
          credentials: config.hsmConfig.credentials,
          enableAuditLogging: config.auditLogging ?? true
        });
      }

      if (config.hsmProvider === "gcp-kms") {
        throw new Error("GCP KMS not yet implemented");
      }

      if (config.hsmProvider === "azure-keyvault") {
        throw new Error("Azure Key Vault not yet implemented");
      }

      throw new Error(`Unknown HSM provider: ${config.hsmProvider}`);
    }

    throw new Error(`Unknown keystore mode: ${config.mode}`);
  }

  /**
   * Creates a signer instance based on configuration.
   */
  static createSigner(keystore: IKeyStore, config: DeviceIdentityConfig): ISigner {
    if (config.mode === "file") {
      return new LocalSigner(keystore, config.auditLogging ?? false);
    }

    if (config.mode === "hsm") {
      if (config.hsmProvider === "aws-kms") {
        if (!config.hsmConfig?.region) {
          throw new Error("AWS KMS requires region configuration");
        }

        return new AwsKmsSigner(keystore, {
          region: config.hsmConfig.region,
          credentials: config.hsmConfig.credentials,
          enableAuditLogging: config.auditLogging ?? true
        });
      }

      if (config.hsmProvider === "gcp-kms") {
        throw new Error("GCP KMS not yet implemented");
      }

      if (config.hsmProvider === "azure-keyvault") {
        throw new Error("Azure Key Vault not yet implemented");
      }

      throw new Error(`Unknown HSM provider: ${config.hsmProvider}`);
    }

    throw new Error(`Unknown signer mode: ${config.mode}`);
  }

  /**
   * Creates both keystore and signer based on configuration.
   */
  static create(config: DeviceIdentityConfig): { keystore: IKeyStore; signer: ISigner } {
    const keystore = DeviceIdentityFactory.createKeyStore(config);
    const signer = DeviceIdentityFactory.createSigner(keystore, config);
    return { keystore, signer };
  }

  /**
   * Creates keystore and signer from environment variables.
   */
  static createFromEnv(): { keystore: IKeyStore; signer: ISigner } {
    const mode = (process.env.DEVICE_IDENTITY_MODE as "file" | "hsm") || "file";
    const keystorePath = process.env.DEVICE_KEYSTORE_PATH;
    const hsmProvider = process.env.HSM_PROVIDER as "aws-kms" | "gcp-kms" | "azure-keyvault" | undefined;
    const auditLogging = process.env.DEVICE_IDENTITY_AUDIT === "true";

    const config: DeviceIdentityConfig = {
      mode,
      keystorePath,
      hsmProvider,
      auditLogging
    };

    if (mode === "hsm") {
      if (hsmProvider === "aws-kms") {
        config.hsmConfig = {
          region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1",
          credentials: process.env.AWS_ACCESS_KEY_ID
            ? {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
              }
            : undefined
        };
      }
    }

    return DeviceIdentityFactory.create(config);
  }
}
