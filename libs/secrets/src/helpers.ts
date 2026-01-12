import type { ISecretProvider } from "./interfaces";
import { SecretsFactory } from "./factory";

/**
 * Helper class for common secret retrieval patterns.
 * Provides convenience methods with fallbacks and type coercion.
 */
export class SecretsHelper {
  constructor(private readonly provider: ISecretProvider) {}

  /**
   * Gets a secret or returns a default value if not found.
   */
  async getOrDefault(key: string, defaultValue: string): Promise<string> {
    const value = await this.provider.get(key);
    return value ?? defaultValue;
  }

  /**
   * Gets a secret or throws an error if not found (required secret).
   */
  async getRequired(key: string): Promise<string> {
    const value = await this.provider.get(key);
    if (value === null) {
      throw new Error(`Required secret not found: ${key}`);
    }
    return value;
  }

  /**
   * Gets a secret as a number.
   */
  async getNumber(key: string, defaultValue?: number): Promise<number | null> {
    const value = await this.provider.get(key);
    if (value === null) {
      return defaultValue ?? null;
    }
    const num = parseInt(value, 10);
    if (isNaN(num)) {
      return defaultValue ?? null;
    }
    return num;
  }

  /**
   * Gets a secret as a boolean.
   */
  async getBoolean(key: string, defaultValue?: boolean): Promise<boolean | null> {
    const value = await this.provider.get(key);
    if (value === null) {
      return defaultValue ?? null;
    }
    return value.toLowerCase() === "true" || value === "1";
  }

  /**
   * Gets a secret as JSON.
   */
  async getJson<T = unknown>(key: string, defaultValue?: T): Promise<T | null> {
    const value = await this.provider.get(key);
    if (value === null) {
      return defaultValue ?? null;
    }
    try {
      return JSON.parse(value) as T;
    } catch (err) {
      return defaultValue ?? null;
    }
  }

  /**
   * Gets database connection string from secrets.
   * Looks for DATABASE_URL or constructs from individual parts.
   */
  async getDatabaseUrl(prefix: string = "DATABASE"): Promise<string | null> {
    // Try to get full connection string first
    const url = await this.provider.get(`${prefix}_URL`);
    if (url) {
      return url;
    }

    // Try to construct from parts
    const parts = await this.provider.getMany([
      `${prefix}_HOST`,
      `${prefix}_PORT`,
      `${prefix}_NAME`,
      `${prefix}_USER`,
      `${prefix}_PASSWORD`
    ]);

    const host = parts.get(`${prefix}_HOST`);
    const port = parts.get(`${prefix}_PORT`);
    const name = parts.get(`${prefix}_NAME`);
    const user = parts.get(`${prefix}_USER`);
    const password = parts.get(`${prefix}_PASSWORD`);

    if (host && name && user && password) {
      const portPart = port ? `:${port}` : "";
      return `postgresql://${user}:${password}@${host}${portPart}/${name}`;
    }

    return null;
  }

  /**
   * Gets MQTT connection URL from secrets.
   */
  async getMqttUrl(prefix: string = "MQTT"): Promise<string | null> {
    // Try to get full URL first
    const url = await this.provider.get(`${prefix}_URL`);
    if (url) {
      return url;
    }

    // Try to construct from parts
    const parts = await this.provider.getMany([
      `${prefix}_HOST`,
      `${prefix}_PORT`,
      `${prefix}_USERNAME`,
      `${prefix}_PASSWORD`
    ]);

    const host = parts.get(`${prefix}_HOST`);
    const port = parts.get(`${prefix}_PORT`) || "1883";
    const username = parts.get(`${prefix}_USERNAME`);
    const password = parts.get(`${prefix}_PASSWORD`);

    if (host) {
      const auth = username && password ? `${username}:${password}@` : "";
      return `mqtt://${auth}${host}:${port}`;
    }

    return null;
  }

  /**
   * Creates a SecretsHelper from environment (singleton).
   */
  static create(): SecretsHelper {
    return new SecretsHelper(SecretsFactory.getInstance());
  }

  /**
   * Creates a SecretsHelper with a specific provider.
   */
  static createWith(provider: ISecretProvider): SecretsHelper {
    return new SecretsHelper(provider);
  }
}
