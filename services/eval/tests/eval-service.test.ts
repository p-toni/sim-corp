import { describe, it, expect, beforeEach } from "vitest";
import { openDatabase } from "../src/db/connection";
import { EvalRepository } from "../src/db/repo";
import { EvalService } from "../src/core/eval-service";
import type { RoastAnalysis, GoldenCase } from "@sim-corp/schemas";

describe("EvalService", () => {
  let db: any;
  let repo: EvalRepository;
  let evalService: EvalService;

  beforeEach(() => {
    db = openDatabase(":memory:");
    repo = new EvalRepository(db);
    evalService = new EvalService(repo);
  });

  it("should create a golden case", () => {
    const goldenCase = evalService.createGoldenCase({
      name: "Ethiopian Yirgacheffe Light",
      machineId: "MACHINE-001",
      batchSizeKg: 5,
      targetFirstCrackSeconds: 480,
      targetDropSeconds: 660,
      targetDevelopmentPercentage: 20,
      fcSecondsErrorTolerance: 30,
      dropSecondsErrorTolerance: 30,
      devPercentageErrorTolerance: 2,
      maxRorSpikes: 2,
      maxRorCrashes: 1,
      tags: ["light", "washed", "ethiopia"]
    });

    expect(goldenCase.id).toMatch(/^golden-/);
    expect(goldenCase.name).toBe("Ethiopian Yirgacheffe Light");
    expect(goldenCase.machineId).toBe("MACHINE-001");
  });

  it("should run evaluation and determine PASS", async () => {
    // Create golden case
    const goldenCase = evalService.createGoldenCase({
      name: "Test Roast",
      machineId: "MACHINE-001",
      targetFirstCrackSeconds: 480,
      targetDropSeconds: 660,
      targetDevelopmentPercentage: 20,
      fcSecondsErrorTolerance: 30,
      dropSecondsErrorTolerance: 30,
      devPercentageErrorTolerance: 2,
      maxRorSpikes: 2,
      maxRorCrashes: 1
    });

    // Mock analysis that matches golden case
    const analysis: RoastAnalysis = {
      sessionId: "session-123",
      analyzedAt: new Date().toISOString(),
      turningPoint: { tempC: 95, elapsedSeconds: 60 },
      firstCrack: { tempC: 196, elapsedSeconds: 490 },
      drop: { tempC: 210, elapsedSeconds: 670 },
      developmentRatio: {
        value: 0.21,
        classification: "MEDIUM",
        details: {}
      },
      crashFlick: {
        detected: false,
        confidence: 0,
        details: {}
      }
    };

    // Run evaluation
    const evalRun = await evalService.runEvaluation({
      sessionId: "session-123",
      goldenCaseId: goldenCase.id,
      analysis,
      orgId: "org-test"
    });

    expect(evalRun.outcome).toBe("PASS");
    expect(evalRun.passedGates).toContain("fc_timing");
    expect(evalRun.passedGates).toContain("drop_timing");
    expect(evalRun.passedGates).toContain("development_ratio");
    expect(evalRun.failedGates).toHaveLength(0);
    expect(evalRun.detailedMetrics?.fcSecondsError).toBe(10);
    expect(evalRun.detailedMetrics?.dropSecondsError).toBe(10);
  });

  it("should run evaluation and determine FAIL", async () => {
    // Create golden case with tight tolerances
    const goldenCase = evalService.createGoldenCase({
      name: "Strict Roast",
      machineId: "MACHINE-001",
      targetFirstCrackSeconds: 480,
      targetDropSeconds: 660,
      targetDevelopmentPercentage: 20,
      fcSecondsErrorTolerance: 5,
      dropSecondsErrorTolerance: 5,
      devPercentageErrorTolerance: 1
    });

    // Mock analysis that misses targets
    const analysis: RoastAnalysis = {
      sessionId: "session-456",
      analyzedAt: new Date().toISOString(),
      turningPoint: { tempC: 95, elapsedSeconds: 60 },
      firstCrack: { tempC: 196, elapsedSeconds: 500 }, // 20s off
      drop: { tempC: 210, elapsedSeconds: 680 }, // 20s off
      developmentRatio: {
        value: 0.26,
        classification: "MEDIUM",
        details: {}
      },
      crashFlick: {
        detected: false,
        confidence: 0,
        details: {}
      }
    };

    // Run evaluation
    const evalRun = await evalService.runEvaluation({
      sessionId: "session-456",
      goldenCaseId: goldenCase.id,
      analysis,
      orgId: "org-test"
    });

    expect(evalRun.outcome).toBe("FAIL");
    expect(evalRun.failedGates).toContain("fc_timing");
    expect(evalRun.failedGates).toContain("drop_timing");
    expect(evalRun.failedGates).toContain("development_ratio");
  });

  it("should check promotion eligibility", async () => {
    const goldenCase = evalService.createGoldenCase({
      name: "Promotion Test",
      machineId: "MACHINE-001",
      targetFirstCrackSeconds: 480,
      targetDropSeconds: 660,
      fcSecondsErrorTolerance: 30,
      dropSecondsErrorTolerance: 30
    });

    const analysis: RoastAnalysis = {
      sessionId: "session-promo",
      analyzedAt: new Date().toISOString(),
      turningPoint: { tempC: 95, elapsedSeconds: 60 },
      firstCrack: { tempC: 196, elapsedSeconds: 485 },
      drop: { tempC: 210, elapsedSeconds: 665 },
      developmentRatio: { value: 0.2, classification: "MEDIUM", details: {} },
      crashFlick: { detected: false, confidence: 0, details: {} }
    };

    await evalService.runEvaluation({
      sessionId: "session-promo",
      goldenCaseId: goldenCase.id,
      analysis
    });

    const result = evalService.canPromote("session-promo");
    expect(result.allowed).toBe(true);
  });

  it("should list golden cases", () => {
    evalService.createGoldenCase({
      name: "Case 1",
      machineId: "MACHINE-001",
      tags: ["test"]
    });

    evalService.createGoldenCase({
      name: "Case 2",
      machineId: "MACHINE-002",
      tags: ["test"]
    });

    const cases = evalService.listGoldenCases();
    expect(cases).toHaveLength(2);
  });
});
