import { describe, expect, it } from "vitest";
import { FakeDriver } from "../src/fake-driver";

describe("FakeDriver", () => {
  it("produces deterministic telemetry with fixed seed", async () => {
    const cfg = {
      orgId: "o",
      siteId: "s",
      machineId: "m",
      connection: { seed: 42, sampleIntervalSeconds: 2 }
    };
    const driverA = new FakeDriver(cfg);
    const driverB = new FakeDriver(cfg);
    await driverA.connect();
    await driverB.connect();

    const a1 = await driverA.readTelemetry();
    const b1 = await driverB.readTelemetry();
    expect(a1.btC).toBeCloseTo(b1.btC, 5);
    expect(a1.elapsedSeconds).toBe(0);

    const a2 = await driverA.readTelemetry();
    const b2 = await driverB.readTelemetry();
    expect(a2.btC).toBeCloseTo(b2.btC, 5);
    expect(a2.elapsedSeconds).toBe(2);
    expect(b2.elapsedSeconds).toBe(2);
  });

  it("increments elapsedSeconds by interval", async () => {
    const driver = new FakeDriver({
      orgId: "o",
      siteId: "s",
      machineId: "m",
      connection: { sampleIntervalSeconds: 5 }
    });
    await driver.connect();
    const p1 = await driver.readTelemetry();
    const p2 = await driver.readTelemetry();
    expect(p1.elapsedSeconds).toBe(0);
    expect(p2.elapsedSeconds).toBe(5);
  });

  it("stays within plausible bounds", async () => {
    const driver = new FakeDriver({
      orgId: "o",
      siteId: "s",
      machineId: "m",
      connection: {}
    });
    await driver.connect();
    const p = await driver.readTelemetry();
    expect(p.btC ?? 0).toBeGreaterThan(150);
    expect(p.btC ?? 0).toBeLessThan(240);
  });

  describe("command operations", () => {
    it("rejects commands when not connected", async () => {
      const driver = new FakeDriver({
        orgId: "o",
        siteId: "s",
        machineId: "m",
        connection: {}
      });

      const result = await driver.writeCommand!({
        commandId: "cmd-1",
        commandType: "SET_POWER",
        machineId: "m",
        targetValue: 75,
        timestamp: new Date().toISOString(),
        constraints: { requireStates: [], forbiddenStates: [] },
        metadata: {}
      });

      expect(result.status).toBe("FAILED");
      expect(result.errorCode).toBe("NOT_CONNECTED");
    });

    it("executes SET_POWER command", async () => {
      const driver = new FakeDriver({
        orgId: "o",
        siteId: "s",
        machineId: "m",
        connection: {}
      });
      await driver.connect();

      const result = await driver.writeCommand!({
        commandId: "cmd-1",
        commandType: "SET_POWER",
        machineId: "m",
        targetValue: 75,
        timestamp: new Date().toISOString(),
        constraints: { requireStates: [], forbiddenStates: [] },
        metadata: {}
      });

      expect(result.status).toBe("ACCEPTED");
      expect(result.actualValue).toBe(75);
      expect(result.metadata?.currentPowerLevel).toBe(75);
    });

    it("executes SET_FAN command", async () => {
      const driver = new FakeDriver({
        orgId: "o",
        siteId: "s",
        machineId: "m",
        connection: {}
      });
      await driver.connect();

      const result = await driver.writeCommand!({
        commandId: "cmd-2",
        commandType: "SET_FAN",
        machineId: "m",
        targetValue: 8,
        timestamp: new Date().toISOString(),
        constraints: { requireStates: [], forbiddenStates: [] },
        metadata: {}
      });

      expect(result.status).toBe("ACCEPTED");
      expect(result.actualValue).toBe(8);
      expect(result.metadata?.currentFanLevel).toBe(8);
    });

    it("executes SET_DRUM command", async () => {
      const driver = new FakeDriver({
        orgId: "o",
        siteId: "s",
        machineId: "m",
        connection: {}
      });
      await driver.connect();

      const result = await driver.writeCommand!({
        commandId: "cmd-3",
        commandType: "SET_DRUM",
        machineId: "m",
        targetValue: 65,
        timestamp: new Date().toISOString(),
        constraints: { requireStates: [], forbiddenStates: [] },
        metadata: {}
      });

      expect(result.status).toBe("ACCEPTED");
      expect(result.actualValue).toBe(65);
      expect(result.metadata?.currentDrumRpm).toBe(65);
    });

    it("constrains SET_POWER to 0-100 range", async () => {
      const driver = new FakeDriver({
        orgId: "o",
        siteId: "s",
        machineId: "m",
        connection: {}
      });
      await driver.connect();

      const result = await driver.writeCommand!({
        commandId: "cmd-4",
        commandType: "SET_POWER",
        machineId: "m",
        targetValue: 150, // Over limit
        timestamp: new Date().toISOString(),
        constraints: { requireStates: [], forbiddenStates: [] },
        metadata: {}
      });

      expect(result.status).toBe("ACCEPTED");
      expect(result.actualValue).toBe(100); // Clamped to max
    });

    it("constrains SET_FAN to 1-10 range", async () => {
      const driver = new FakeDriver({
        orgId: "o",
        siteId: "s",
        machineId: "m",
        connection: {}
      });
      await driver.connect();

      const result = await driver.writeCommand!({
        commandId: "cmd-5",
        commandType: "SET_FAN",
        machineId: "m",
        targetValue: 0, // Below minimum
        timestamp: new Date().toISOString(),
        constraints: { requireStates: [], forbiddenStates: [] },
        metadata: {}
      });

      expect(result.status).toBe("ACCEPTED");
      expect(result.actualValue).toBe(1); // Clamped to min
    });

    it("executes ABORT command", async () => {
      const driver = new FakeDriver({
        orgId: "o",
        siteId: "s",
        machineId: "m",
        connection: {}
      });
      await driver.connect();

      // First set some values
      await driver.writeCommand!({
        commandId: "cmd-setup",
        commandType: "SET_POWER",
        machineId: "m",
        targetValue: 75,
        timestamp: new Date().toISOString(),
        constraints: { requireStates: [], forbiddenStates: [] },
        metadata: {}
      });

      // Then abort
      const result = await driver.writeCommand!({
        commandId: "cmd-abort",
        commandType: "ABORT",
        machineId: "m",
        timestamp: new Date().toISOString(),
        constraints: { requireStates: [], forbiddenStates: [] },
        metadata: {}
      });

      expect(result.status).toBe("ACCEPTED");
      expect(result.metadata?.currentPowerLevel).toBe(0);
      expect(result.metadata?.currentFanLevel).toBe(1);
      expect(result.metadata?.currentDrumRpm).toBe(0);
    });

    it("rejects unsupported command types", async () => {
      const driver = new FakeDriver({
        orgId: "o",
        siteId: "s",
        machineId: "m",
        connection: {}
      });
      await driver.connect();

      const result = await driver.writeCommand!({
        commandId: "cmd-unsupported",
        commandType: "DROP" as any, // Not supported by FakeDriver
        machineId: "m",
        timestamp: new Date().toISOString(),
        constraints: { requireStates: [], forbiddenStates: [] },
        metadata: {}
      });

      expect(result.status).toBe("REJECTED");
      expect(result.errorCode).toBe("UNSUPPORTED_COMMAND");
    });

    it("tracks command status", async () => {
      const driver = new FakeDriver({
        orgId: "o",
        siteId: "s",
        machineId: "m",
        connection: {}
      });
      await driver.connect();

      await driver.writeCommand!({
        commandId: "cmd-tracked",
        commandType: "SET_POWER",
        machineId: "m",
        targetValue: 50,
        timestamp: new Date().toISOString(),
        constraints: { requireStates: [], forbiddenStates: [] },
        metadata: {}
      });

      const status = await driver.getCommandStatus!("cmd-tracked");
      expect(status).toBeDefined();
      expect(status?.commandId).toBe("cmd-tracked");
      expect(status?.status).toBe("COMPLETED");
      expect(status?.progress).toBe(100);
    });

    it("aborts specific command via abortCommand", async () => {
      const driver = new FakeDriver({
        orgId: "o",
        siteId: "s",
        machineId: "m",
        connection: {}
      });
      await driver.connect();

      const result = await driver.abortCommand!("cmd-to-abort");

      expect(result.status).toBe("ACCEPTED");
      expect(result.message).toContain("Aborted command cmd-to-abort");
    });

    it("returns to safe state via abortCommand with no ID", async () => {
      const driver = new FakeDriver({
        orgId: "o",
        siteId: "s",
        machineId: "m",
        connection: {}
      });
      await driver.connect();

      // Set some values first
      await driver.writeCommand!({
        commandId: "cmd-setup",
        commandType: "SET_POWER",
        machineId: "m",
        targetValue: 75,
        timestamp: new Date().toISOString(),
        constraints: { requireStates: [], forbiddenStates: [] },
        metadata: {}
      });

      // Abort all
      const result = await driver.abortCommand!();

      expect(result.status).toBe("ACCEPTED");
      expect(result.message).toContain("Returned to safe state");
    });

    it("executes PREHEAT command", async () => {
      const driver = new FakeDriver({
        orgId: "o",
        siteId: "s",
        machineId: "m",
        connection: {}
      });
      await driver.connect();

      const result = await driver.writeCommand!({
        commandId: "cmd-preheat",
        commandType: "PREHEAT",
        machineId: "m",
        timestamp: new Date().toISOString(),
        constraints: { requireStates: [], forbiddenStates: [] },
        metadata: {}
      });

      expect(result.status).toBe("ACCEPTED");
      expect(result.actualValue).toBe(100); // Preheat sets power to 100%
      expect(result.metadata?.currentPowerLevel).toBe(100);
    });
  });
});
