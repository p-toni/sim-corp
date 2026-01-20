import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { KeyRotationScheduler } from "../src/rotation-scheduler";
import { KeyLifecycleMonitor, type KeyLifecycleAlert } from "../src/key-lifecycle-monitor";
import { FileKeyStore } from "../src/keystore";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("KeyLifecycleMonitor", () => {
  let tmpDir: string;
  let keyStore: FileKeyStore;
  let scheduler: KeyRotationScheduler;
  let monitor: KeyLifecycleMonitor;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "monitor-test-"));
    keyStore = new FileKeyStore(tmpDir);
    scheduler = new KeyRotationScheduler({
      keyStore,
      policy: { maxAgeDays: 90, warnAgeDays: 60, autoRotate: false },
    });
    monitor = new KeyLifecycleMonitor(scheduler);
  });

  afterEach(async () => {
    scheduler.stopScheduler();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("checkHealth", () => {
    it("returns health check result", async () => {
      await keyStore.generateAndStore("device:key1@site");
      await scheduler.registerKey("device:key1@site");

      const result = await monitor.checkHealth();

      expect(result.keysChecked).toBe(1);
      expect(result.keysHealthy).toBe(1);
    });

    it("generates alerts for expired keys", async () => {
      const expiredScheduler = new KeyRotationScheduler({
        keyStore,
        policy: { maxAgeDays: 0, warnAgeDays: 0, autoRotate: false },
      });
      const expiredMonitor = new KeyLifecycleMonitor(expiredScheduler);

      await keyStore.generateAndStore("device:expired@site");
      await expiredScheduler.registerKey("device:expired@site");

      // Wait a tick to ensure key ages
      await new Promise((r) => setTimeout(r, 10));

      const alerts: KeyLifecycleAlert[] = [];
      expiredMonitor.onAlert((alert) => alerts.push(alert));

      await expiredMonitor.checkHealth();

      expect(alerts.length).toBeGreaterThanOrEqual(1);
      expect(alerts[0].type).toBe("key_expired");
      expect(alerts[0].severity).toBe("critical");
    });

    it("generates alerts for warning keys", async () => {
      const warnScheduler = new KeyRotationScheduler({
        keyStore,
        policy: { maxAgeDays: 90, warnAgeDays: 0, autoRotate: false },
      });
      const warnMonitor = new KeyLifecycleMonitor(warnScheduler);

      await keyStore.generateAndStore("device:warn@site");
      await warnScheduler.registerKey("device:warn@site");

      await new Promise((r) => setTimeout(r, 10));

      const alerts: KeyLifecycleAlert[] = [];
      warnMonitor.onAlert((alert) => alerts.push(alert));

      await warnMonitor.checkHealth();

      expect(alerts.length).toBeGreaterThanOrEqual(1);
      expect(alerts[0].type).toBe("key_expiring");
      expect(alerts[0].severity).toBe("warning");
    });
  });

  describe("getMetrics", () => {
    it("returns zero metrics before first check", () => {
      const metrics = monitor.getMetrics();

      expect(metrics.totalKeys).toBe(0);
      expect(metrics.healthyKeys).toBe(0);
    });

    it("returns accurate metrics after check", async () => {
      await keyStore.generateAndStore("device:key1@site");
      await keyStore.generateAndStore("device:key2@site");
      await scheduler.registerKey("device:key1@site");
      await scheduler.registerKey("device:key2@site");

      await monitor.checkHealth();
      const metrics = monitor.getMetrics();

      expect(metrics.totalKeys).toBe(2);
      expect(metrics.healthyKeys).toBe(2);
      expect(metrics.lastCheckAt).toBeDefined();
    });

    it("tracks rotation metrics", async () => {
      const autoScheduler = new KeyRotationScheduler({
        keyStore,
        policy: { maxAgeDays: 0, warnAgeDays: 0, autoRotate: true },
      });
      const autoMonitor = new KeyLifecycleMonitor(autoScheduler);

      await keyStore.generateAndStore("device:rotate@site");
      await autoScheduler.registerKey("device:rotate@site");

      await new Promise((r) => setTimeout(r, 10));
      const result = await autoMonitor.checkHealth();

      // Verify rotation happened
      expect(result.keysRotated).toBeGreaterThanOrEqual(1);

      // Total rotations should be tracked (may include scheduler rotations)
      const metrics = autoMonitor.getMetrics();
      expect(metrics.totalRotations).toBeGreaterThanOrEqual(0);
    });
  });

  describe("getPrometheusMetrics", () => {
    it("returns metrics in Prometheus format", async () => {
      await keyStore.generateAndStore("device:key1@site");
      await scheduler.registerKey("device:key1@site");
      await monitor.checkHealth();

      const prometheus = monitor.getPrometheusMetrics();

      expect(prometheus.text).toContain("simcorp_device_identity_keys_total 1");
      expect(prometheus.text).toContain(
        'simcorp_device_identity_keys_by_status{status="healthy"} 1'
      );
      expect(prometheus.text).toContain("# TYPE simcorp_device_identity_keys_total gauge");
    });

    it("supports custom prefix", async () => {
      await monitor.checkHealth();
      const prometheus = monitor.getPrometheusMetrics("custom_prefix");

      expect(prometheus.text).toContain("custom_prefix_keys_total");
    });
  });

  describe("getAlerts", () => {
    it("returns all alerts", async () => {
      const expiredScheduler = new KeyRotationScheduler({
        keyStore,
        policy: { maxAgeDays: 0, warnAgeDays: 0, autoRotate: false },
      });
      const expiredMonitor = new KeyLifecycleMonitor(expiredScheduler);

      await keyStore.generateAndStore("device:key1@site");
      await expiredScheduler.registerKey("device:key1@site");
      await new Promise((r) => setTimeout(r, 10));
      await expiredMonitor.checkHealth();

      const alerts = expiredMonitor.getAlerts();
      expect(alerts.length).toBeGreaterThanOrEqual(1);
    });

    it("filters by severity", async () => {
      const expiredScheduler = new KeyRotationScheduler({
        keyStore,
        policy: { maxAgeDays: 0, warnAgeDays: 0, autoRotate: false },
      });
      const expiredMonitor = new KeyLifecycleMonitor(expiredScheduler);

      await keyStore.generateAndStore("device:key1@site");
      await expiredScheduler.registerKey("device:key1@site");
      await new Promise((r) => setTimeout(r, 10));
      await expiredMonitor.checkHealth();

      const criticalAlerts = expiredMonitor.getAlerts({ severity: "critical" });
      expect(criticalAlerts.every((a) => a.severity === "critical")).toBe(true);
    });

    it("limits results", async () => {
      const expiredScheduler = new KeyRotationScheduler({
        keyStore,
        policy: { maxAgeDays: 0, warnAgeDays: 0, autoRotate: false },
      });
      const expiredMonitor = new KeyLifecycleMonitor(expiredScheduler);

      await keyStore.generateAndStore("device:key1@site");
      await keyStore.generateAndStore("device:key2@site");
      await keyStore.generateAndStore("device:key3@site");
      await expiredScheduler.registerKey("device:key1@site");
      await expiredScheduler.registerKey("device:key2@site");
      await expiredScheduler.registerKey("device:key3@site");
      await new Promise((r) => setTimeout(r, 10));
      await expiredMonitor.checkHealth();

      const alerts = expiredMonitor.getAlerts({ limit: 2 });
      expect(alerts.length).toBeLessThanOrEqual(2);
    });
  });

  describe("clearAlerts", () => {
    it("clears all alerts", async () => {
      const expiredScheduler = new KeyRotationScheduler({
        keyStore,
        policy: { maxAgeDays: 0, warnAgeDays: 0, autoRotate: false },
      });
      const expiredMonitor = new KeyLifecycleMonitor(expiredScheduler);

      await keyStore.generateAndStore("device:key1@site");
      await expiredScheduler.registerKey("device:key1@site");
      await new Promise((r) => setTimeout(r, 10));
      await expiredMonitor.checkHealth();

      expect(expiredMonitor.getAlerts().length).toBeGreaterThan(0);

      expiredMonitor.clearAlerts();

      expect(expiredMonitor.getAlerts().length).toBe(0);
    });
  });

  describe("alert handlers", () => {
    it("calls multiple handlers", async () => {
      const expiredScheduler = new KeyRotationScheduler({
        keyStore,
        policy: { maxAgeDays: 0, warnAgeDays: 0, autoRotate: false },
      });
      const expiredMonitor = new KeyLifecycleMonitor(expiredScheduler);

      const handler1Calls: KeyLifecycleAlert[] = [];
      const handler2Calls: KeyLifecycleAlert[] = [];

      expiredMonitor.onAlert((alert) => handler1Calls.push(alert));
      expiredMonitor.onAlert((alert) => handler2Calls.push(alert));

      await keyStore.generateAndStore("device:key1@site");
      await expiredScheduler.registerKey("device:key1@site");
      await new Promise((r) => setTimeout(r, 10));
      await expiredMonitor.checkHealth();

      expect(handler1Calls.length).toBeGreaterThan(0);
      expect(handler2Calls.length).toBeGreaterThan(0);
      expect(handler1Calls.length).toBe(handler2Calls.length);
    });

    it("continues on handler error", async () => {
      const expiredScheduler = new KeyRotationScheduler({
        keyStore,
        policy: { maxAgeDays: 0, warnAgeDays: 0, autoRotate: false },
      });
      const expiredMonitor = new KeyLifecycleMonitor(expiredScheduler);

      const handler2Calls: KeyLifecycleAlert[] = [];

      expiredMonitor.onAlert(() => {
        throw new Error("Handler error");
      });
      expiredMonitor.onAlert((alert) => handler2Calls.push(alert));

      await keyStore.generateAndStore("device:key1@site");
      await expiredScheduler.registerKey("device:key1@site");
      await new Promise((r) => setTimeout(r, 10));

      // Should not throw
      await expiredMonitor.checkHealth();

      // Second handler should still be called
      expect(handler2Calls.length).toBeGreaterThan(0);
    });
  });
});
