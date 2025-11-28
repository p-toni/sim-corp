import { describe, expect, it } from "vitest";
import { detectCrashFlick } from "../src/core/crash-flick";
import { DEFAULT_CONFIG } from "../src/core/config";

describe("detectCrashFlick", () => {
  it("flags crash when RoR drops sharply", () => {
    const telemetry = [
      { ts: new Date(0).toISOString(), machineId: "m", elapsedSeconds: 0, rorCPerMin: 20 },
      { ts: new Date(10_000).toISOString(), machineId: "m", elapsedSeconds: 10, rorCPerMin: 5 }
    ];
    const result = detectCrashFlick(telemetry, 0, 20, DEFAULT_CONFIG);
    expect(result.crashDetected).toBe(true);
  });
});
