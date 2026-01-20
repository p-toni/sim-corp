import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { KeyRotationScheduler, InMemoryKeyMetadataStore, DEFAULT_ROTATION_POLICY } from "../src/rotation-scheduler";
import { FileKeyStore } from "../src/keystore";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("KeyRotationScheduler", () => {
  let tmpDir: string;
  let keyStore: FileKeyStore;
  let scheduler: KeyRotationScheduler;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "rotation-test-"));
    keyStore = new FileKeyStore(tmpDir);
    scheduler = new KeyRotationScheduler({
      keyStore,
      policy: { maxAgeDays: 90, warnAgeDays: 60, autoRotate: false },
    });
  });

  afterEach(async () => {
    scheduler.stopScheduler();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("registerKey", () => {
    it("creates metadata for a new key", async () => {
      const kid = "device:test@site";
      const metadata = await scheduler.registerKey(kid);

      expect(metadata.kid).toBe(kid);
      expect(metadata.rotationCount).toBe(0);
      expect(metadata.status).toBe("healthy");
      expect(metadata.ageInDays).toBe(0);
      expect(metadata.nextRotationDue).toBeDefined();
    });
  });

  describe("getKeyMetadata", () => {
    it("returns existing metadata", async () => {
      const kid = "device:test@site";
      await scheduler.registerKey(kid);
      const metadata = await scheduler.getKeyMetadata(kid);

      expect(metadata.kid).toBe(kid);
      expect(metadata.status).toBe("healthy");
    });

    it("creates metadata if not exists", async () => {
      const kid = "device:new@site";
      const metadata = await scheduler.getKeyMetadata(kid);

      expect(metadata.kid).toBe(kid);
      expect(metadata.rotationCount).toBe(0);
    });
  });

  describe("rotateKey", () => {
    it("rotates a key and updates metadata", async () => {
      const kid = "device:rotate@site";
      await keyStore.generateAndStore(kid);
      await scheduler.registerKey(kid);

      const metadata = await scheduler.rotateKey(kid);

      expect(metadata.rotationCount).toBe(1);
      expect(metadata.lastRotatedAt).toBeDefined();
      expect(metadata.status).toBe("healthy");
      expect(metadata.ageInDays).toBe(0);
    });

    it("increments rotation count on each rotation", async () => {
      const kid = "device:multi-rotate@site";
      await keyStore.generateAndStore(kid);

      await scheduler.rotateKey(kid);
      await scheduler.rotateKey(kid);
      const metadata = await scheduler.rotateKey(kid);

      expect(metadata.rotationCount).toBe(3);
    });

    it("adds audit log entry on rotation", async () => {
      const kid = "device:audit@site";
      await keyStore.generateAndStore(kid);

      await scheduler.rotateKey(kid);
      const auditLog = scheduler.getAuditLog();

      expect(auditLog).toHaveLength(1);
      expect(auditLog[0].operation).toBe("ROTATE_KEY");
      expect(auditLog[0].kid).toBe(kid);
      expect(auditLog[0].success).toBe(true);
    });
  });

  describe("checkAndRotateKeys", () => {
    it("checks all keys and reports status", async () => {
      await keyStore.generateAndStore("device:key1@site");
      await keyStore.generateAndStore("device:key2@site");
      await scheduler.registerKey("device:key1@site");
      await scheduler.registerKey("device:key2@site");

      const result = await scheduler.checkAndRotateKeys();

      expect(result.keysChecked).toBe(2);
      expect(result.keysHealthy).toBe(2);
      expect(result.keysWarning).toBe(0);
      expect(result.keysExpired).toBe(0);
      expect(result.keysRotated).toBe(0);
      expect(result.details).toHaveLength(2);
    });

    it("auto-rotates expired keys when enabled", async () => {
      const autoRotateScheduler = new KeyRotationScheduler({
        keyStore,
        policy: { maxAgeDays: 0, warnAgeDays: 0, autoRotate: true }, // Immediate expiry
      });

      const kid = "device:expired@site";
      await keyStore.generateAndStore(kid);
      await autoRotateScheduler.registerKey(kid);

      // Wait a tick to ensure time passes
      await new Promise((r) => setTimeout(r, 10));

      const result = await autoRotateScheduler.checkAndRotateKeys();

      expect(result.keysRotated).toBe(1);
      expect(result.keysHealthy).toBe(1);
    });
  });

  describe("getKeysNeedingRotation", () => {
    it("returns keys with warn or expired status", async () => {
      const warnScheduler = new KeyRotationScheduler({
        keyStore,
        metadataStore: new InMemoryKeyMetadataStore(),
        policy: { maxAgeDays: 90, warnAgeDays: 0, autoRotate: false }, // Immediate warn
      });

      await keyStore.generateAndStore("device:warn@site");
      await warnScheduler.registerKey("device:warn@site");

      // Wait a tick
      await new Promise((r) => setTimeout(r, 10));

      const needsRotation = await warnScheduler.getKeysNeedingRotation();

      expect(needsRotation.length).toBeGreaterThanOrEqual(1);
      expect(needsRotation[0].status).toBe("warn");
    });
  });

  describe("scheduler lifecycle", () => {
    it("starts and stops scheduler", () => {
      expect(scheduler.isSchedulerRunning()).toBe(false);

      scheduler.startScheduler(60000);
      expect(scheduler.isSchedulerRunning()).toBe(true);

      scheduler.stopScheduler();
      expect(scheduler.isSchedulerRunning()).toBe(false);
    });

    it("throws if scheduler already running", () => {
      scheduler.startScheduler(60000);

      expect(() => scheduler.startScheduler(60000)).toThrow("Scheduler already running");

      scheduler.stopScheduler();
    });
  });

  describe("policy", () => {
    it("uses default policy when not specified", () => {
      const defaultScheduler = new KeyRotationScheduler({ keyStore });
      const policy = defaultScheduler.getPolicy();

      expect(policy).toEqual(DEFAULT_ROTATION_POLICY);
    });

    it("merges custom policy with defaults", () => {
      const customScheduler = new KeyRotationScheduler({
        keyStore,
        policy: { maxAgeDays: 30 },
      });
      const policy = customScheduler.getPolicy();

      expect(policy.maxAgeDays).toBe(30);
      expect(policy.warnAgeDays).toBe(DEFAULT_ROTATION_POLICY.warnAgeDays);
      expect(policy.autoRotate).toBe(DEFAULT_ROTATION_POLICY.autoRotate);
    });
  });
});
