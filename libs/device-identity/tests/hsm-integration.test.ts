import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FileKeyStore,
  LocalSigner,
  DeviceIdentityFactory,
  type DeviceIdentityConfig
} from "../src/index";
import { verifyTelemetry } from "../src/signing";

describe("T-036: HSM Integration", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "device-identity-test-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("FileKeyStore (refactored)", () => {
    it("should generate and store keypair", async () => {
      const keystore = new FileKeyStore(testDir);
      const kid = "device:test-machine@site1";

      const keypair = await keystore.generateAndStore(kid);

      expect(keypair.kid).toBe(kid);
      expect(keypair.publicKey).toContain("BEGIN PUBLIC KEY");
      expect(keypair.privateKey).toContain("BEGIN PRIVATE KEY");
      expect(keypair.publicKeyJwk).toHaveProperty("crv", "Ed25519");
      expect(keypair.hsmKeyId).toBeUndefined();
    });

    it("should load public key only", async () => {
      const keystore = new FileKeyStore(testDir);
      const kid = "device:test-machine@site1";

      await keystore.generateAndStore(kid);
      const publicKey = await keystore.loadPublicKey(kid);

      expect(publicKey).not.toBeNull();
      expect(publicKey?.kid).toBe(kid);
      expect(publicKey?.publicKey).toContain("BEGIN PUBLIC KEY");
      expect(publicKey?.publicKeyJwk).toHaveProperty("crv", "Ed25519");
    });

    it("should get or create keypair", async () => {
      const keystore = new FileKeyStore(testDir);
      const kid = "device:test-machine@site1";

      const keypair1 = await keystore.getOrCreate(kid);
      const keypair2 = await keystore.getOrCreate(kid);

      expect(keypair1.kid).toBe(keypair2.kid);
      expect(keypair1.publicKey).toBe(keypair2.publicKey);
    });

    it("should list all key IDs", async () => {
      const keystore = new FileKeyStore(testDir);

      await keystore.generateAndStore("device:machine1@site1");
      await keystore.generateAndStore("device:machine2@site1");

      const kids = await keystore.listKids();

      expect(kids).toHaveLength(2);
      expect(kids).toContain("device:machine1@site1");
      expect(kids).toContain("device:machine2@site1");
    });

    it("should rotate keypair", async () => {
      const keystore = new FileKeyStore(testDir);
      const kid = "device:test-machine@site1";

      const original = await keystore.generateAndStore(kid);
      const rotated = await keystore.rotate(kid);

      expect(rotated.kid).toBe(original.kid);
      expect(rotated.publicKey).not.toBe(original.publicKey);
      expect(rotated.privateKey).not.toBe(original.privateKey);
    });
  });

  describe("LocalSigner", () => {
    it("should sign telemetry payload", async () => {
      const keystore = new FileKeyStore(testDir);
      const signer = new LocalSigner(keystore, false);
      const kid = "device:test-machine@site1";

      await keystore.generateAndStore(kid);

      const payload = {
        machineId: "test-machine",
        temperature: 200,
        timestamp: new Date().toISOString()
      };

      const signed = await signer.sign(payload, kid);

      expect(signed.kid).toBe(kid);
      expect(signed.sig).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/); // JWT format
      expect(signed.payload).toEqual(payload);
    });

    it("should generate audit log when enabled", async () => {
      const keystore = new FileKeyStore(testDir);
      const signer = new LocalSigner(keystore, true);
      const kid = "device:test-machine@site1";

      await keystore.generateAndStore(kid);

      const payload = { test: "data" };
      await signer.sign(payload, kid);

      const auditLog = await signer.getAuditLog!();
      expect(auditLog).toHaveLength(1);
      expect(auditLog[0].operation).toBe("SIGN");
      expect(auditLog[0].kid).toBe(kid);
      expect(auditLog[0].success).toBe(true);
    });

    it("should verify signed payload", async () => {
      const keystore = new FileKeyStore(testDir);
      const signer = new LocalSigner(keystore, false);
      const kid = "device:test-machine@site1";

      const keypair = await keystore.generateAndStore(kid);

      const payload = {
        machineId: "test-machine",
        temperature: 200
      };

      const signed = await signer.sign(payload, kid);

      // Verify the signature
      const verified = await verifyTelemetry(signed.sig, keypair.publicKey, kid);

      expect(verified.machineId).toBe(payload.machineId);
      expect(verified.temperature).toBe(payload.temperature);
    });
  });

  describe("DeviceIdentityFactory", () => {
    it("should create file-based keystore and signer", () => {
      const config: DeviceIdentityConfig = {
        mode: "file",
        keystorePath: testDir,
        auditLogging: false
      };

      const { keystore, signer } = DeviceIdentityFactory.create(config);

      expect(keystore).toBeInstanceOf(FileKeyStore);
      expect(signer).toBeInstanceOf(LocalSigner);
    });

    it("should throw error for HSM without provider", () => {
      const config: DeviceIdentityConfig = {
        mode: "hsm",
        auditLogging: false
      };

      expect(() => DeviceIdentityFactory.create(config)).toThrow();
    });

    it("should create from environment variables", () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        DEVICE_IDENTITY_MODE: "file",
        DEVICE_KEYSTORE_PATH: testDir,
        DEVICE_IDENTITY_AUDIT: "true"
      };

      const { keystore, signer } = DeviceIdentityFactory.createFromEnv();

      expect(keystore).toBeInstanceOf(FileKeyStore);
      expect(signer).toBeInstanceOf(LocalSigner);

      process.env = originalEnv;
    });
  });

  describe("Backward compatibility", () => {
    it("should support DeviceKeyStore alias", async () => {
      const { DeviceKeyStore } = await import("../src/keystore");
      const keystore = new DeviceKeyStore(testDir);
      const kid = "device:test-machine@site1";

      const keypair = await keystore.generateAndStore(kid);

      expect(keypair.kid).toBe(kid);
      expect(keypair.publicKey).toContain("BEGIN PUBLIC KEY");
    });
  });

  describe("End-to-end workflow", () => {
    it("should support complete signing workflow", async () => {
      const config: DeviceIdentityConfig = {
        mode: "file",
        keystorePath: testDir,
        auditLogging: true
      };

      const { keystore, signer } = DeviceIdentityFactory.create(config);

      // Generate keys
      const kid = "device:test-machine@site1";
      const keypair = await keystore.getOrCreate(kid);

      // Sign telemetry
      const payload = {
        machineId: "test-machine",
        temperature: 200,
        timestamp: new Date().toISOString()
      };

      const signed = await signer.sign(payload, kid);

      // Verify signature
      const verified = await verifyTelemetry(signed.sig, keypair.publicKey, kid);

      expect(verified.machineId).toBe(payload.machineId);

      // Check audit log
      const auditLog = await signer.getAuditLog!();
      expect(auditLog).toHaveLength(1);
      expect(auditLog[0].success).toBe(true);
    });
  });
});
