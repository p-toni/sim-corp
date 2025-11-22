import { describe, expect, it } from "vitest";
import type { TelemetryPoint } from "@sim-corp/schemas";
import { simulateRoast } from "../src/core/model";
import { SimRoastRequestSchema } from "../src/core/types";

function baseInput(seed = 42) {
  return SimRoastRequestSchema.parse({ seed });
}

describe("simulateRoast", () => {
  it("produces telemetry and core events", () => {
    const input = baseInput();
    const result = simulateRoast(input);

    expect(result.telemetry.length).toBeGreaterThan(0);
    expect(result.events).toHaveLength(4);

    const eventTypes = result.events.map((event) => event.type);
    expect(eventTypes).toEqual(["CHARGE", "TP", "FC", "DROP"]);
  });

  it("keeps FC and DROP near targets", () => {
    const targetInput = SimRoastRequestSchema.parse({
      seed: 7,
      targetFirstCrackSeconds: 500,
      targetDropSeconds: 640
    });

    const result = simulateRoast(targetInput);
    const fcElapsed = extractElapsed(result.events, "FC");
    const dropElapsed = extractElapsed(result.events, "DROP");

    expect(Math.abs(fcElapsed - targetInput.targetFirstCrackSeconds)).toBeLessThanOrEqual(30);
    expect(Math.abs(dropElapsed - targetInput.targetDropSeconds)).toBeLessThanOrEqual(30);
  });

  it("produces mostly monotonic BT curve", () => {
    const result = simulateRoast(baseInput(99));
    const largeDrops = countLargeNegativeSteps(result.telemetry);
    expect(largeDrops).toBe(0);
  });

  it("is deterministic for a given seed", () => {
    const input = baseInput(1234);
    const first = simulateRoast(input);
    const second = simulateRoast(input);

    expect(second).toEqual(first);
  });
});

function extractElapsed(events: ReturnType<typeof simulateRoast>["events"], type: string): number {
  const event = events.find((entry) => entry.type === type);
  if (!event) {
    throw new Error(`Missing ${type} event`);
  }
  const payload = (event.payload ?? {}) as { elapsedSeconds?: number };
  if (typeof payload.elapsedSeconds !== "number") {
    throw new Error(`Missing elapsedSeconds for ${type}`);
  }
  return payload.elapsedSeconds;
}

function countLargeNegativeSteps(points: TelemetryPoint[]): number {
  let count = 0;
  for (let idx = 1; idx < points.length; idx += 1) {
    const previousPoint = points[idx - 1]!;
    const currentPoint = points[idx]!;
    const previous = previousPoint.btC ?? 0;
    const current = currentPoint.btC ?? 0;
    if (current - previous < -3) {
      count += 1;
    }
  }
  return count;
}
