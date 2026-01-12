import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  EnvSecretProvider,
  SecretsFactory,
  SecretsHelper,
  type SecretsConfig
} from "../src/index";

describe("T-040: Secrets Management", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
    SecretsFactory.resetInstance();
  });

  afterEach(() => {
    process.env = originalEnv;
    SecretsFactory.resetInstance();
  });

  describe("EnvSecretProvider", () => {
    it("should get secret from environment", async () => {
      process.env.TEST_SECRET = "test-value";

      const provider = new EnvSecretProvider();
      const value = await provider.get("TEST_SECRET");

      expect(value).toBe("test-value");
    });

    it("should return null for missing secret", async () => {
      const provider = new EnvSecretProvider();
      const value = await provider.get("MISSING_SECRET");

      expect(value).toBeNull();
    });

    it("should get multiple secrets", async () => {
      process.env.SECRET_1 = "value1";
      process.env.SECRET_2 = "value2";
      process.env.SECRET_3 = "value3";

      const provider = new EnvSecretProvider();
      const values = await provider.getMany(["SECRET_1", "SECRET_2", "SECRET_3", "MISSING"]);

      expect(values.get("SECRET_1")).toBe("value1");
      expect(values.get("SECRET_2")).toBe("value2");
      expect(values.get("SECRET_3")).toBe("value3");
      expect(values.get("MISSING")).toBeNull();
    });

    it("should get secrets by prefix", async () => {
      process.env.DATABASE_HOST = "localhost";
      process.env.DATABASE_PORT = "5432";
      process.env.DATABASE_NAME = "testdb";
      process.env.OTHER_SECRET = "other";

      const provider = new EnvSecretProvider();
      const values = await provider.getByPrefix("DATABASE_");

      expect(values.size).toBe(3);
      expect(values.get("DATABASE_HOST")).toBe("localhost");
      expect(values.get("DATABASE_PORT")).toBe("5432");
      expect(values.get("DATABASE_NAME")).toBe("testdb");
      expect(values.has("OTHER_SECRET")).toBe(false);
    });

    it("should set secret", async () => {
      const provider = new EnvSecretProvider();
      const success = await provider.set!("NEW_SECRET", "new-value");

      expect(success).toBe(true);
      expect(process.env.NEW_SECRET).toBe("new-value");
    });

    it("should generate audit log when enabled", async () => {
      process.env.TEST_SECRET = "test-value";

      const provider = new EnvSecretProvider(true);
      await provider.get("TEST_SECRET");
      await provider.get("MISSING");
      await provider.set!("NEW_SECRET", "value");

      const auditLog = await provider.getAuditLog!();
      expect(auditLog.length).toBe(3);
      expect(auditLog[0].operation).toBe("GET");
      expect(auditLog[0].key).toBe("TEST_SECRET");
      expect(auditLog[0].success).toBe(true);
      expect(auditLog[1].key).toBe("MISSING");
      expect(auditLog[1].success).toBe(false);
      expect(auditLog[2].operation).toBe("SET");
      expect(auditLog[2].success).toBe(true);
    });

    it("should refresh (no-op for env provider)", async () => {
      const provider = new EnvSecretProvider();
      await expect(provider.refresh!()).resolves.toBeUndefined();
    });
  });

  describe("SecretsFactory", () => {
    it("should create EnvSecretProvider", () => {
      const config: SecretsConfig = {
        provider: "env",
        auditLogging: false
      };

      const provider = SecretsFactory.createProvider(config);
      expect(provider).toBeInstanceOf(EnvSecretProvider);
    });

    it("should create provider from environment variables", () => {
      process.env.SECRETS_PROVIDER = "env";
      process.env.SECRETS_AUDIT = "true";

      const provider = SecretsFactory.createFromEnv();
      expect(provider).toBeInstanceOf(EnvSecretProvider);
    });

    it("should create singleton instance", () => {
      process.env.SECRETS_PROVIDER = "env";

      const provider1 = SecretsFactory.getInstance();
      const provider2 = SecretsFactory.getInstance();

      expect(provider1).toBe(provider2);
    });

    it("should reset singleton instance", () => {
      process.env.SECRETS_PROVIDER = "env";

      const provider1 = SecretsFactory.getInstance();
      SecretsFactory.resetInstance();
      const provider2 = SecretsFactory.getInstance();

      expect(provider1).not.toBe(provider2);
    });

    it("should throw error for unknown provider", () => {
      const config: SecretsConfig = {
        provider: "unknown" as any
      };

      expect(() => SecretsFactory.createProvider(config)).toThrow("Unknown secret provider");
    });

    it("should throw error for Vault (not implemented)", () => {
      const config: SecretsConfig = {
        provider: "vault"
      };

      expect(() => SecretsFactory.createProvider(config)).toThrow("not yet implemented");
    });
  });

  describe("SecretsHelper", () => {
    let provider: EnvSecretProvider;
    let helper: SecretsHelper;

    beforeEach(() => {
      provider = new EnvSecretProvider();
      helper = SecretsHelper.createWith(provider);
    });

    it("should get or return default value", async () => {
      process.env.EXISTING = "value";

      const existing = await helper.getOrDefault("EXISTING", "default");
      const missing = await helper.getOrDefault("MISSING", "default");

      expect(existing).toBe("value");
      expect(missing).toBe("default");
    });

    it("should get required secret", async () => {
      process.env.REQUIRED = "value";

      const value = await helper.getRequired("REQUIRED");
      expect(value).toBe("value");
    });

    it("should throw error for missing required secret", async () => {
      await expect(helper.getRequired("MISSING")).rejects.toThrow("Required secret not found");
    });

    it("should get secret as number", async () => {
      process.env.NUMBER = "42";
      process.env.NOT_NUMBER = "abc";

      const num = await helper.getNumber("NUMBER");
      const notNum = await helper.getNumber("NOT_NUMBER", 10);
      const missing = await helper.getNumber("MISSING", 5);

      expect(num).toBe(42);
      expect(notNum).toBe(10); // fallback to default
      expect(missing).toBe(5);
    });

    it("should get secret as boolean", async () => {
      process.env.TRUE_1 = "true";
      process.env.TRUE_2 = "TRUE";
      process.env.TRUE_3 = "1";
      process.env.FALSE_1 = "false";
      process.env.FALSE_2 = "0";

      const true1 = await helper.getBoolean("TRUE_1");
      const true2 = await helper.getBoolean("TRUE_2");
      const true3 = await helper.getBoolean("TRUE_3");
      const false1 = await helper.getBoolean("FALSE_1");
      const false2 = await helper.getBoolean("FALSE_2");
      const missing = await helper.getBoolean("MISSING", false);

      expect(true1).toBe(true);
      expect(true2).toBe(true);
      expect(true3).toBe(true);
      expect(false1).toBe(false);
      expect(false2).toBe(false);
      expect(missing).toBe(false);
    });

    it("should get secret as JSON", async () => {
      process.env.JSON = '{"key": "value", "number": 42}';
      process.env.NOT_JSON = "not json";

      const json = await helper.getJson("JSON");
      const notJson = await helper.getJson("NOT_JSON", { default: true });
      const missing = await helper.getJson("MISSING", { default: true });

      expect(json).toEqual({ key: "value", number: 42 });
      expect(notJson).toEqual({ default: true }); // fallback
      expect(missing).toEqual({ default: true });
    });

    it("should construct database URL from full URL", async () => {
      process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/dbname";

      const url = await helper.getDatabaseUrl();
      expect(url).toBe("postgresql://user:pass@localhost:5432/dbname");
    });

    it("should construct database URL from parts", async () => {
      process.env.DATABASE_HOST = "localhost";
      process.env.DATABASE_PORT = "5432";
      process.env.DATABASE_NAME = "testdb";
      process.env.DATABASE_USER = "testuser";
      process.env.DATABASE_PASSWORD = "testpass";

      const url = await helper.getDatabaseUrl();
      expect(url).toBe("postgresql://testuser:testpass@localhost:5432/testdb");
    });

    it("should construct database URL from parts without port", async () => {
      process.env.DATABASE_HOST = "localhost";
      process.env.DATABASE_NAME = "testdb";
      process.env.DATABASE_USER = "testuser";
      process.env.DATABASE_PASSWORD = "testpass";

      const url = await helper.getDatabaseUrl();
      expect(url).toBe("postgresql://testuser:testpass@localhost/testdb");
    });

    it("should return null for incomplete database config", async () => {
      process.env.DATABASE_HOST = "localhost";
      // Missing other parts

      const url = await helper.getDatabaseUrl();
      expect(url).toBeNull();
    });

    it("should construct MQTT URL from full URL", async () => {
      process.env.MQTT_URL = "mqtt://user:pass@localhost:1883";

      const url = await helper.getMqttUrl();
      expect(url).toBe("mqtt://user:pass@localhost:1883");
    });

    it("should construct MQTT URL from parts", async () => {
      process.env.MQTT_HOST = "localhost";
      process.env.MQTT_PORT = "1883";
      process.env.MQTT_USERNAME = "user";
      process.env.MQTT_PASSWORD = "pass";

      const url = await helper.getMqttUrl();
      expect(url).toBe("mqtt://user:pass@localhost:1883");
    });

    it("should construct MQTT URL from parts without auth", async () => {
      process.env.MQTT_HOST = "localhost";
      process.env.MQTT_PORT = "1883";

      const url = await helper.getMqttUrl();
      expect(url).toBe("mqtt://localhost:1883");
    });

    it("should create helper from environment", () => {
      process.env.SECRETS_PROVIDER = "env";

      const helper = SecretsHelper.create();
      expect(helper).toBeInstanceOf(SecretsHelper);
    });
  });

  describe("End-to-end workflow", () => {
    it("should support complete secrets workflow", async () => {
      // Setup secrets
      process.env.API_KEY = "sk-1234567890";
      process.env.DATABASE_HOST = "db.example.com";
      process.env.DATABASE_PORT = "5432";
      process.env.DATABASE_NAME = "prod";
      process.env.DATABASE_USER = "admin";
      process.env.DATABASE_PASSWORD = "secret123";
      process.env.FEATURE_FLAG = "true";
      process.env.MAX_CONNECTIONS = "100";

      // Create helper
      const helper = SecretsHelper.create();

      // Retrieve various secret types
      const apiKey = await helper.getRequired("API_KEY");
      const dbUrl = await helper.getDatabaseUrl();
      const featureFlag = await helper.getBoolean("FEATURE_FLAG");
      const maxConnections = await helper.getNumber("MAX_CONNECTIONS");

      // Verify
      expect(apiKey).toBe("sk-1234567890");
      expect(dbUrl).toBe("postgresql://admin:secret123@db.example.com:5432/prod");
      expect(featureFlag).toBe(true);
      expect(maxConnections).toBe(100);
    });
  });
});
