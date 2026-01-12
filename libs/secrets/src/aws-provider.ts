import {
  SecretsManagerClient,
  GetSecretValueCommand,
  CreateSecretCommand,
  UpdateSecretCommand,
  RotateSecretCommand,
  ListSecretsCommand,
  type SecretListEntry
} from "@aws-sdk/client-secrets-manager";
import type { ISecretProvider, SecretAuditEntry, SecretCacheEntry } from "./interfaces";

/**
 * AWS Secrets Manager provider for production.
 * Caches secrets in memory with configurable TTL.
 * Supports secret rotation and audit logging.
 */
export class AwsSecretsProvider implements ISecretProvider {
  private client: SecretsManagerClient;
  private cache: Map<string, SecretCacheEntry> = new Map();
  private auditLog: SecretAuditEntry[] = [];

  constructor(
    private readonly config: {
      region: string;
      credentials?: {
        accessKeyId: string;
        secretAccessKey: string;
      };
      cacheTtl?: number; // seconds
      enableAuditLogging?: boolean;
    }
  ) {
    this.client = new SecretsManagerClient({
      region: config.region,
      credentials: config.credentials
    });
  }

  async get(key: string): Promise<string | null> {
    const startTime = Date.now();
    let success = false;
    let error: string | undefined;

    try {
      // Check cache first
      const cached = this.getFromCache(key);
      if (cached !== null) {
        success = true;
        return cached;
      }

      // Fetch from AWS Secrets Manager
      const command = new GetSecretValueCommand({ SecretId: key });
      const response = await this.client.send(command);

      const value = response.SecretString ?? null;
      if (value !== null) {
        this.setCache(key, value);
      }

      success = value !== null;
      return value;
    } catch (err: any) {
      if (err.name === "ResourceNotFoundException") {
        // Secret not found - return null
        success = true; // Not an error, just doesn't exist
        return null;
      }
      error = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      if (this.config.enableAuditLogging) {
        this.auditLog.push({
          timestamp: new Date().toISOString(),
          operation: "GET",
          key,
          success,
          error,
          metadata: {
            duration: Date.now() - startTime,
            cached: cached !== null
          }
        });
      }
    }
  }

  async getMany(keys: string[]): Promise<Map<string, string | null>> {
    const startTime = Date.now();
    let success = false;
    let error: string | undefined;

    try {
      const result = new Map<string, string | null>();

      // Fetch each secret (AWS doesn't have batch get)
      await Promise.all(
        keys.map(async (key) => {
          const value = await this.get(key);
          result.set(key, value);
        })
      );

      success = true;
      return result;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      if (this.config.enableAuditLogging) {
        this.auditLog.push({
          timestamp: new Date().toISOString(),
          operation: "GET_MANY",
          key: keys.join(","),
          success,
          error,
          metadata: {
            duration: Date.now() - startTime,
            count: keys.length
          }
        });
      }
    }
  }

  async getByPrefix(prefix: string): Promise<Map<string, string>> {
    const startTime = Date.now();
    let success = false;
    let error: string | undefined;

    try {
      const result = new Map<string, string>();

      // List all secrets
      const command = new ListSecretsCommand({});
      const response = await this.client.send(command);

      const secrets = response.SecretList ?? [];
      const matchingSecrets = secrets.filter(s => s.Name?.startsWith(prefix));

      // Fetch each matching secret
      await Promise.all(
        matchingSecrets.map(async (secret) => {
          if (secret.Name) {
            const value = await this.get(secret.Name);
            if (value !== null) {
              result.set(secret.Name, value);
            }
          }
        })
      );

      success = true;
      return result;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      if (this.config.enableAuditLogging) {
        this.auditLog.push({
          timestamp: new Date().toISOString(),
          operation: "GET",
          key: `prefix:${prefix}`,
          success,
          error,
          metadata: {
            duration: Date.now() - startTime
          }
        });
      }
    }
  }

  async set(key: string, value: string): Promise<boolean> {
    const startTime = Date.now();
    let success = false;
    let error: string | undefined;

    try {
      // Try to update existing secret first
      try {
        const updateCommand = new UpdateSecretCommand({
          SecretId: key,
          SecretString: value
        });
        await this.client.send(updateCommand);
      } catch (err: any) {
        // If secret doesn't exist, create it
        if (err.name === "ResourceNotFoundException") {
          const createCommand = new CreateSecretCommand({
            Name: key,
            SecretString: value
          });
          await this.client.send(createCommand);
        } else {
          throw err;
        }
      }

      // Update cache
      this.setCache(key, value);

      success = true;
      return true;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      return false;
    } finally {
      if (this.config.enableAuditLogging) {
        this.auditLog.push({
          timestamp: new Date().toISOString(),
          operation: "SET",
          key,
          success,
          error,
          metadata: {
            duration: Date.now() - startTime
          }
        });
      }
    }
  }

  async rotate(key: string): Promise<string> {
    const startTime = Date.now();
    let success = false;
    let error: string | undefined;

    try {
      // Trigger rotation (requires Lambda function configured)
      const command = new RotateSecretCommand({
        SecretId: key
      });
      await this.client.send(command);

      // Clear cache for this key
      this.cache.delete(key);

      // Fetch new value
      const newValue = await this.get(key);
      if (!newValue) {
        throw new Error("Failed to retrieve rotated secret");
      }

      success = true;
      return newValue;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      if (this.config.enableAuditLogging) {
        this.auditLog.push({
          timestamp: new Date().toISOString(),
          operation: "ROTATE",
          key,
          success,
          error,
          metadata: {
            duration: Date.now() - startTime
          }
        });
      }
    }
  }

  async refresh(): Promise<void> {
    const startTime = Date.now();
    let success = false;
    let error: string | undefined;

    try {
      // Clear cache to force re-fetch on next get()
      this.cache.clear();
      success = true;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      if (this.config.enableAuditLogging) {
        this.auditLog.push({
          timestamp: new Date().toISOString(),
          operation: "REFRESH",
          key: "all",
          success,
          error,
          metadata: {
            duration: Date.now() - startTime
          }
        });
      }
    }
  }

  async getAuditLog(): Promise<SecretAuditEntry[]> {
    return [...this.auditLog];
  }

  private getFromCache(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    const ttl = this.config.cacheTtl ?? 300; // 5 minutes default
    const age = (Date.now() - entry.fetchedAt) / 1000; // seconds

    if (age > ttl) {
      // Cache expired
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  private setCache(key: string, value: string): void {
    const ttl = this.config.cacheTtl ?? 300;
    this.cache.set(key, {
      value,
      fetchedAt: Date.now(),
      ttl
    });
  }
}
