import type { ISecretProvider, SecretAuditEntry } from "./interfaces";

/**
 * Environment-based secret provider for development.
 * Reads secrets from process.env (standard environment variables).
 * For development and testing only - use AWS Secrets Manager or Vault for production.
 */
export class EnvSecretProvider implements ISecretProvider {
  private auditLog: SecretAuditEntry[] = [];

  constructor(private readonly enableAuditLogging: boolean = false) {}

  async get(key: string): Promise<string | null> {
    const startTime = Date.now();
    let success = false;
    let error: string | undefined;

    try {
      const value = process.env[key] ?? null;
      success = value !== null;
      return value;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      if (this.enableAuditLogging) {
        this.auditLog.push({
          timestamp: new Date().toISOString(),
          operation: "GET",
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

  async getMany(keys: string[]): Promise<Map<string, string | null>> {
    const startTime = Date.now();
    let success = false;
    let error: string | undefined;

    try {
      const result = new Map<string, string | null>();
      for (const key of keys) {
        result.set(key, process.env[key] ?? null);
      }
      success = true;
      return result;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      if (this.enableAuditLogging) {
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
    const result = new Map<string, string>();

    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(prefix) && value !== undefined) {
        result.set(key, value);
      }
    }

    if (this.enableAuditLogging) {
      this.auditLog.push({
        timestamp: new Date().toISOString(),
        operation: "GET",
        key: `prefix:${prefix}`,
        success: true,
        metadata: {
          count: result.size
        }
      });
    }

    return result;
  }

  async set(key: string, value: string): Promise<boolean> {
    const startTime = Date.now();
    let success = false;
    let error: string | undefined;

    try {
      process.env[key] = value;
      success = true;
      return true;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      return false;
    } finally {
      if (this.enableAuditLogging) {
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

  async refresh(): Promise<void> {
    // No-op for environment provider (process.env is always current)
    if (this.enableAuditLogging) {
      this.auditLog.push({
        timestamp: new Date().toISOString(),
        operation: "REFRESH",
        key: "all",
        success: true
      });
    }
  }

  async getAuditLog(): Promise<SecretAuditEntry[]> {
    return [...this.auditLog];
  }
}
