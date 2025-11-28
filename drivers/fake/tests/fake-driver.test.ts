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
});
