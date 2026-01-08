import { describe, it, expect, beforeEach, vi } from "vitest";
import { LMJudge } from "../src/core/lm-judge";
import type { GoldenCase, RoastAnalysis } from "@sim-corp/schemas";

describe("LMJudge", () => {
  const mockGoldenCase: GoldenCase = {
    id: "golden-1",
    name: "Test Ethiopian",
    description: "Light roast",
    origin: "Ethiopia",
    processingMethod: "Washed",
    variety: "Heirloom",
    machineId: "test-machine",
    batchSizeKg: 15,
    chargeTempC: 200,
    targetFirstCrackSeconds: 480,
    targetDropSeconds: 660,
    targetDevelopmentPercentage: 20,
    targetFCTempC: 196,
    targetDropTempC: 210,
    fcSecondsErrorTolerance: 30,
    dropSecondsErrorTolerance: 30,
    devPercentageErrorTolerance: 2,
    maxRorSpikes: 2,
    maxRorCrashes: 1,
    tags: [],
    createdBy: "test-user",
    createdAt: new Date().toISOString(),
  };

  const mockAnalysis: RoastAnalysis = {
    sessionId: "session-1",
    analyzedAt: new Date().toISOString(),
    turningPoint: { tempC: 95, elapsedSeconds: 60 },
    firstCrack: { tempC: 196, elapsedSeconds: 485 },
    drop: { tempC: 210, elapsedSeconds: 665 },
    developmentRatio: { value: 0.21, classification: "MEDIUM", details: {} },
    crashFlick: { detected: false, confidence: 0, details: {} },
  };

  it("returns null when disabled", async () => {
    const judge = new LMJudge({ enabled: false });

    const result = await judge.evaluate({
      goldenCase: mockGoldenCase,
      analysis: mockAnalysis,
      sessionId: "session-1",
    });

    expect(result).toBeNull();
  });

  it("returns null when enabled but no API key", async () => {
    const judge = new LMJudge({ enabled: true });

    const result = await judge.evaluate({
      goldenCase: mockGoldenCase,
      analysis: mockAnalysis,
      sessionId: "session-1",
    });

    expect(result).toBeNull();
  });

  it("constructs judge with custom model", () => {
    const judge = new LMJudge({
      enabled: true,
      apiKey: "test-key",
      model: "claude-3-opus-20240229",
    });

    expect(judge).toBeDefined();
  });

  // Note: Full integration tests with real API calls would require:
  // 1. Valid API key
  // 2. Network access
  // 3. Potentially slow test execution
  // These should be run separately as integration tests, not unit tests
});
