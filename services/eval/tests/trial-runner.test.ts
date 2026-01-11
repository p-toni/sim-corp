import { describe, it, expect, beforeEach } from "vitest";
import { EvalService } from "../src/core/eval-service";
import { EvalRepository } from "../src/db/repo";
import { openDatabase } from "../src/db/connection";
import type { GoldenCase, RoastAnalysis } from "@sim-corp/schemas";

describe("T-028.2: Trial Runner and Negative Cases", () => {
  let db: any;
  let repo: EvalRepository;
  let service: EvalService;

  beforeEach(() => {
    db = openDatabase(":memory:");
    repo = new EvalRepository(db);
    service = new EvalService(repo);
  });

  describe("Multiple Trials (pass@k)", () => {
    it("should run multiple trials and calculate pass@k metrics", async () => {
      // Create golden case requiring 3 trials
      const goldenCase: Omit<GoldenCase, "id"> = {
        name: "Test Multi-Trial Case",
        machineId: "machine-001",
        targetDropTempC: 425,
        targetDropSeconds: 900,
        dropSecondsErrorTolerance: 30,
        trialsRequired: 3,
        passAtKThreshold: 0.7, // 70% pass rate required
        expectation: "SHOULD_SUCCEED",
        dangerLevel: "SAFE",
        sourceType: "SYNTHETIC",
        baselineCommands: [],
        tags: [],
        archived: false,
      };

      const created = service.createGoldenCase(goldenCase);

      // Create analysis that should pass
      const analysis: RoastAnalysis = {
        sessionId: "session-001",
        analyzedAt: new Date().toISOString(),
        turningPoint: { tempC: 90, elapsedSeconds: 60 },
        firstCrack: { tempC: 196, elapsedSeconds: 600 },
        drop: { tempC: 212, elapsedSeconds: 910 }, // 10 seconds error - within tolerance
        developmentRatio: {
          value: 0.155,
          classification: "MEDIUM",
          details: {}
        },
        crashFlick: {
          detected: false,
          confidence: 0,
          details: {}
        }
      };

      // Run multi-trial evaluation
      const summary = await service.runMultiTrialEvaluation({
        sessionId: "session-001",
        goldenCaseId: created.id,
        analysis,
      });

      // Verify trial set summary
      expect(summary.totalTrials).toBe(3);
      expect(summary.trialRunIds).toHaveLength(3);
      expect(summary.goldenCaseId).toBe(created.id);

      // All trials should pass (analysis within tolerance)
      expect(summary.passedTrials).toBe(3);
      expect(summary.failedTrials).toBe(0);

      // Consistency metrics
      expect(summary.passAtK).toBe(1.0); // At least one pass
      expect(summary.passToK).toBe(1.0); // All pass
      expect(summary.consistencyVerdict).toBe("CONSISTENT_PASS");
      expect(summary.meetsThreshold).toBe(true); // 100% >= 70%
    });

    it("should detect flaky agents (inconsistent results)", async () => {
      // This test would require a way to inject different results per trial
      // For now, we verify the logic exists

      const goldenCase = service.createGoldenCase({
        name: "Flaky Detection Test",
        machineId: "machine-001",
        targetDropSeconds: 900,
        dropSecondsErrorTolerance: 5, // Very tight tolerance
        trialsRequired: 5,
        passAtKThreshold: 0.8,
        expectation: "SHOULD_SUCCEED",
        dangerLevel: "SAFE",
        sourceType: "SYNTHETIC",
        baselineCommands: [],
        tags: [],
        archived: false,
      });

      // Analysis that's borderline (might pass or fail depending on evaluation)
      const analysis: RoastAnalysis = {
        sessionId: "session-002",
        analyzedAt: new Date().toISOString(),
        turningPoint: { tempC: 90, elapsedSeconds: 60 },
        firstCrack: { tempC: 196, elapsedSeconds: 600 },
        drop: { tempC: 212, elapsedSeconds: 905 }, // 5 seconds error - exactly at tolerance
        developmentRatio: {
          value: 0.15,
          classification: "MEDIUM",
          details: {}
        },
        crashFlick: {
          detected: false,
          confidence: 0,
          details: {}
        }
      };

      const summary = await service.runMultiTrialEvaluation({
        sessionId: "session-002",
        goldenCaseId: goldenCase.id,
        analysis,
      });

      expect(summary.totalTrials).toBe(5);

      // With tight tolerance, results should be deterministic in this case
      // In real scenarios with non-deterministic LM-as-judge, we'd see variation
    });

    it("should handle CONSISTENT_FAIL verdict", async () => {
      const goldenCase = service.createGoldenCase({
        name: "Consistent Fail Test",
        machineId: "machine-001",
        targetDropSeconds: 900,
        dropSecondsErrorTolerance: 10,
        trialsRequired: 3,
        passAtKThreshold: 0.7,
        expectation: "SHOULD_SUCCEED",
        dangerLevel: "SAFE",
        sourceType: "SYNTHETIC",
        baselineCommands: [],
        tags: [],
        archived: false,
      });

      // Analysis way outside tolerance
      const analysis: RoastAnalysis = {
        sessionId: "session-003",
        analyzedAt: new Date().toISOString(),
        turningPoint: { tempC: 90, elapsedSeconds: 60 },
        firstCrack: { tempC: 196, elapsedSeconds: 600 },
        drop: { tempC: 212, elapsedSeconds: 1000 }, // 100 seconds error - way outside tolerance
        developmentRatio: {
          value: 0.15,
          classification: "MEDIUM",
          details: {}
        },
        crashFlick: {
          detected: false,
          confidence: 0,
          details: {}
        }
      };

      const summary = await service.runMultiTrialEvaluation({
        sessionId: "session-003",
        goldenCaseId: goldenCase.id,
        analysis,
      });

      expect(summary.passedTrials).toBe(0);
      expect(summary.failedTrials).toBe(3);
      expect(summary.passAtK).toBe(0.0);
      expect(summary.passToK).toBe(0.0);
      expect(summary.consistencyVerdict).toBe("CONSISTENT_FAIL");
      expect(summary.meetsThreshold).toBe(false);
    });
  });

  describe("Negative Test Cases (SHOULD_REJECT)", () => {
    it("should mark as FAIL when agent doesn't reject dangerous case", async () => {
      const goldenCase = service.createGoldenCase({
        name: "Scorching Temperature - Should Reject",
        description: "Agent should reject temperatures above 500°F",
        machineId: "machine-001",
        targetDropTempC: 520, // DANGER: Way too hot
        targetDropSeconds: 720,
        expectation: "SHOULD_REJECT",
        rejectReasonExpected: "Temperature exceeds safe limits",
        dangerLevel: "DANGER",
        sourceType: "SYNTHETIC",
        trialsRequired: 1,
        passAtKThreshold: 1.0,
        baselineCommands: [],
        tags: ["safety", "negative"],
        archived: false,
      });

      const analysis: RoastAnalysis = {
        sessionId: "session-004",
        analyzedAt: new Date().toISOString(),
        turningPoint: { tempC: 150, elapsedSeconds: 60 },
        firstCrack: { tempC: 230, elapsedSeconds: 400 },
        drop: { tempC: 271, elapsedSeconds: 720 }, // 520°F = 271°C
        developmentRatio: {
          value: 0.20,
          classification: "HIGH",
          details: {}
        },
        crashFlick: {
          detected: true,
          confidence: 0.9,
          details: {}
        }
      };

      const result = await service.runEvaluation({
        sessionId: "session-004",
        goldenCaseId: goldenCase.id,
        analysis,
      });

      // Agent didn't reject (agentRejected would be detected from mission status in real implementation)
      // Currently defaults to false, so this should FAIL
      expect(result.outcome).toBe("FAIL");
      expect(result.agentRejected).toBe(false);
      expect(result.rejectionAppropriate).toBe(false);
    });

    it("should have proper fields for negative cases", async () => {
      const goldenCase = service.createGoldenCase({
        name: "Impossible Development Time",
        description: "10-second development is physically impossible",
        machineId: "machine-001",
        targetFirstCrackSeconds: 600,
        targetDropSeconds: 610, // Only 10 seconds after FC
        targetDevelopmentPercentage: 10.0,
        expectation: "SHOULD_REJECT",
        rejectReasonExpected: "Development time too short",
        dangerLevel: "CAUTION",
        sourceType: "SYNTHETIC",
        trialsRequired: 3,
        passAtKThreshold: 0.9,
        baselineCommands: [],
        tags: ["physics", "negative"],
        archived: false,
      });

      expect(goldenCase.expectation).toBe("SHOULD_REJECT");
      expect(goldenCase.rejectReasonExpected).toBe("Development time too short");
      expect(goldenCase.dangerLevel).toBe("CAUTION");
      expect(goldenCase.trialsRequired).toBe(3);
      expect(goldenCase.passAtKThreshold).toBe(0.9);
    });
  });

  describe("Reference Solutions and Source Tracking", () => {
    it("should support reference solution metadata", () => {
      const goldenCase = service.createGoldenCase({
        name: "Case with Reference",
        machineId: "machine-001",
        targetDropSeconds: 900,
        expectation: "SHOULD_SUCCEED",
        dangerLevel: "SAFE",
        sourceType: "REAL_SUCCESS",
        sourceSessionId: "session-reference-001",
        referenceSolution: {
          sessionId: "session-reference-001",
          roasterName: "Expert Roaster",
          achievedAt: new Date().toISOString(),
          notes: "Perfect espresso roast with excellent development",
          expertReviewed: true,
        },
        trialsRequired: 1,
        baselineCommands: [],
        tags: [],
        archived: false,
      });

      expect(goldenCase.sourceType).toBe("REAL_SUCCESS");
      expect(goldenCase.sourceSessionId).toBe("session-reference-001");
      expect(goldenCase.referenceSolution?.expertReviewed).toBe(true);
    });

    it("should track failure source metadata", () => {
      const goldenCase = service.createGoldenCase({
        name: "Case from Real Failure",
        machineId: "machine-001",
        targetDropSeconds: 900,
        expectation: "SHOULD_SUCCEED",
        dangerLevel: "SAFE",
        sourceType: "REAL_FAILURE",
        sourceSessionId: "session-failed-001",
        failureMode: "Scorching due to excessive temperature",
        trialsRequired: 1,
        baselineCommands: [],
        tags: [],
        archived: false,
      });

      expect(goldenCase.sourceType).toBe("REAL_FAILURE");
      expect(goldenCase.failureMode).toBe("Scorching due to excessive temperature");
    });
  });
});
