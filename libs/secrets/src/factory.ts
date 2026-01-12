import type { ISecretProvider, SecretsConfig } from "./interfaces";
import { EnvSecretProvider } from "./env-provider";
import { AwsSecretsProvider } from "./aws-provider";

/**
 * Factory for creating secret provider instances based on configuration.
 */
export class SecretsFactory {
  /**
   * Creates a secret provider based on configuration.
   */
  static createProvider(config: SecretsConfig): ISecretProvider {
    if (config.provider === "env") {
      return new EnvSecretProvider(config.auditLogging ?? false);
    }

    if (config.provider === "aws") {
      if (!config.aws?.region) {
        throw new Error("AWS Secrets Manager requires region configuration");
      }

      return new AwsSecretsProvider({
        region: config.aws.region,
        credentials: config.aws.credentials,
        cacheTtl: config.cacheTtl ?? 300, // 5 minutes default
        enableAuditLogging: config.auditLogging ?? true
      });
    }

    if (config.provider === "vault") {
      throw new Error("HashiCorp Vault provider not yet implemented");
    }

    throw new Error(`Unknown secret provider: ${config.provider}`);
  }

  /**
   * Creates a secret provider from environment variables.
   */
  static createFromEnv(): ISecretProvider {
    const provider = (process.env.SECRETS_PROVIDER as "env" | "aws" | "vault") || "env";
    const cacheTtl = process.env.SECRETS_CACHE_TTL ? parseInt(process.env.SECRETS_CACHE_TTL, 10) : 300;
    const auditLogging = process.env.SECRETS_AUDIT === "true";

    const config: SecretsConfig = {
      provider,
      cacheTtl,
      auditLogging
    };

    if (provider === "aws") {
      config.aws = {
        region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1",
        credentials: process.env.AWS_ACCESS_KEY_ID
          ? {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
            }
          : undefined
      };
    }

    if (provider === "vault") {
      config.vault = {
        address: process.env.VAULT_ADDR || "http://127.0.0.1:8200",
        token: process.env.VAULT_TOKEN || "",
        namespace: process.env.VAULT_NAMESPACE
      };
    }

    return SecretsFactory.createProvider(config);
  }

  /**
   * Creates a singleton secret provider (cached).
   * Use this in services to avoid creating multiple provider instances.
   */
  private static _instance: ISecretProvider | null = null;

  static getInstance(): ISecretProvider {
    if (!SecretsFactory._instance) {
      SecretsFactory._instance = SecretsFactory.createFromEnv();
    }
    return SecretsFactory._instance;
  }

  /**
   * Resets the singleton instance (for testing).
   */
  static resetInstance(): void {
    SecretsFactory._instance = null;
  }
}
