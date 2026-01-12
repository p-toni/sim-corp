/**
 * Abstract interface for secret storage and retrieval.
 * Implementations can be environment-based (dev), AWS Secrets Manager (prod), or HashiCorp Vault.
 */
export interface ISecretProvider {
  /**
   * Retrieves a secret value by key.
   * @param key - Secret key/name
   * @returns Secret value or null if not found
   */
  get(key: string): Promise<string | null>;

  /**
   * Retrieves multiple secrets by keys.
   * @param keys - Array of secret keys
   * @returns Map of key to value (missing keys have null values)
   */
  getMany(keys: string[]): Promise<Map<string, string | null>>;

  /**
   * Retrieves all secrets with a given prefix.
   * @param prefix - Secret key prefix (e.g., "database/")
   * @returns Map of key to value
   */
  getByPrefix(prefix: string): Promise<Map<string, string>>;

  /**
   * Sets a secret value (if supported by provider).
   * @param key - Secret key/name
   * @param value - Secret value
   * @returns Success boolean
   */
  set?(key: string, value: string): Promise<boolean>;

  /**
   * Rotates a secret (generates new value, deprecates old).
   * @param key - Secret key to rotate
   * @returns New secret value
   */
  rotate?(key: string): Promise<string>;

  /**
   * Refreshes cached secrets from the provider.
   */
  refresh?(): Promise<void>;

  /**
   * Gets audit log entries for secret access (production only).
   * @returns Array of audit log entries or empty array if not supported
   */
  getAuditLog?(): Promise<SecretAuditEntry[]>;
}

/**
 * Audit log entry for secret access.
 */
export interface SecretAuditEntry {
  timestamp: string;
  operation: "GET" | "GET_MANY" | "SET" | "ROTATE" | "REFRESH";
  key: string;
  success: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Configuration for secret provider.
 */
export interface SecretsConfig {
  /** Provider mode: 'env' for dev, 'aws' for AWS Secrets Manager, 'vault' for HashiCorp Vault */
  provider: "env" | "aws" | "vault";

  /** Cache TTL in seconds (default: 300 = 5 minutes) */
  cacheTtl?: number;

  /** Enable audit logging for all operations */
  auditLogging?: boolean;

  /** AWS Secrets Manager configuration (for provider='aws') */
  aws?: {
    region: string;
    credentials?: {
      accessKeyId: string;
      secretAccessKey: string;
    };
  };

  /** HashiCorp Vault configuration (for provider='vault') */
  vault?: {
    address: string;
    token: string;
    namespace?: string;
  };
}

/**
 * Secret cache entry.
 */
export interface SecretCacheEntry {
  value: string;
  fetchedAt: number;
  ttl: number;
}
