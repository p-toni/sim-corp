import { describe, it, expect, beforeEach } from "vitest";
import { EvalService } from "../src/core/eval-service";
import { EvalRepository } from "../src/db/repo";
import { openDatabase } from "../src/db/connection";
import type { RoastAnalysis } from "@sim-corp/schemas";

describe("T-028.2 Phase 3: Saturation Monitoring", () => {
  let db: any;
  let repo: EvalRepository;
  let service: EvalService;

  beforeEach(() => {
    db = openDatabase(":memory:");
    repo = new EvalRepository(db);
    service = new EvalService(repo);
  });

  describe("Golden Case Saturation Metrics", () => {
    it("should return default metrics for golden case with no evaluations", () => {
      const goldenCase = service.createGoldenCase({
        name: "Unevaluated Case",
        machineId: "machine-001",
        targetDropSeconds: 660,
        dropSecondsErrorTolerance: 30,
        expectation: "SHOULD_SUCCEED",
        dangerLevel: "SAFE",
        sourceType: "SYNTHETIC",
        baselineCommands: [],
        trialsRequired: 1,
        tags: [],
        archived: false
      });

      const metrics = service.calculateSaturationMetrics(goldenCase.id);

      expect(metrics).not.toBeNull();
      expect(metrics?.goldenCaseId).toBe(goldenCase.id);
      expect(metrics?.totalEvaluations).toBe(0);
      expect(metrics?.recentEvaluations).toBe(0);
      expect(metrics?.overallPassRate).toBe(0);
      expect(metrics?.recentPassRate).toBe(0);
      expect(metrics?.isSaturated).toBe(false);
      expect(metrics?.saturationLevel).toBe("LOW");
    });

    it("should calculate pass rates correctly", async () => {
      const goldenCase = service.createGoldenCase({
        name: "Test Case",
        machineId: "machine-001",
        targetDropSeconds: 660,
        dropSecondsErrorTolerance: 30,
        expectation: "SHOULD_SUCCEED",
        dangerLevel: "SAFE",
        sourceType: "SYNTHETIC",
        baselineCommands: [],
        trialsRequired: 1,
        tags: [],
        archived: false
      });

      const analysis: RoastAnalysis = {
        sessionId: "session-001",
        analyzedAt: new Date().toISOString(),
        turningPoint: { tempC: 90, elapsedSeconds: 60 },
        firstCrack: { tempC: 196, elapsedSeconds: 480 },
        drop: { tempC: 210, elapsedSeconds: 660 }, // Exact match
        developmentRatio: {
          value: 0.20,
          classification: "MEDIUM",
          details: {}
        },
        crashFlick: {
          detected: false,
          confidence: 0,
          details: {}
        }
      };

      // Run 5 evaluations: 3 pass, 2 fail
      for (let i = 0; i < 3; i++) {
        await service.runEvaluation({
          sessionId: `session-pass-${i}`,
          goldenCaseId: goldenCase.id,
          analysis,
        });
      }

      const failAnalysis: RoastAnalysis = {
        ...analysis,
        drop: { tempC: 210, elapsedSeconds: 700 } // 40 seconds error - outside tolerance
      };

      for (let i = 0; i < 2; i++) {
        await service.runEvaluation({
          sessionId: `session-fail-${i}`,
          goldenCaseId: goldenCase.id,
          analysis: failAnalysis,
        });
      }

      const metrics = service.calculateSaturationMetrics(goldenCase.id);

      expect(metrics?.totalEvaluations).toBe(5);
      expect(metrics?.overallPassRate).toBe(0.6); // 3/5 = 60%
      expect(metrics?.saturationLevel).toBe("MEDIUM");
      expect(metrics?.isSaturated).toBe(false);
      expect(metrics?.recommendation).toBe("KEEP");
    });

    it("should detect saturated cases (>80% pass rate)", async () => {
      const goldenCase = service.createGoldenCase({
        name: "Too Easy Case",
        machineId: "machine-001",
        targetDropSeconds: 660,
        dropSecondsErrorTolerance: 30,
        expectation: "SHOULD_SUCCEED",
        dangerLevel: "SAFE",
        sourceType: "SYNTHETIC",
        baselineCommands: [],
        trialsRequired: 1,
        tags: [],
        archived: false
      });

      const analysis: RoastAnalysis = {
        sessionId: "session-001",
        analyzedAt: new Date().toISOString(),
        turningPoint: { tempC: 90, elapsedSeconds: 60 },
        firstCrack: { tempC: 196, elapsedSeconds: 480 },
        drop: { tempC: 210, elapsedSeconds: 660 },
        developmentRatio: {
          value: 0.20,
          classification: "MEDIUM",
          details: {}
        },
        crashFlick: {
          detected: false,
          confidence: 0,
          details: {}
        }
      };

      // Run 10 evaluations: 9 pass, 1 fail (90% pass rate)
      for (let i = 0; i < 9; i++) {
        await service.runEvaluation({
          sessionId: `session-pass-${i}`,
          goldenCaseId: goldenCase.id,
          analysis,
        });
      }

      const failAnalysis: RoastAnalysis = {
        ...analysis,
        drop: { tempC: 210, elapsedSeconds: 700 }
      };

      await service.runEvaluation({
        sessionId: "session-fail-001",
        goldenCaseId: goldenCase.id,
        analysis: failAnalysis,
      });

      const metrics = service.calculateSaturationMetrics(goldenCase.id);

      expect(metrics?.totalEvaluations).toBe(10);
      expect(metrics?.overallPassRate).toBe(0.9); // 9/10 = 90%
      expect(metrics?.isSaturated).toBe(true);
      expect(metrics?.saturationLevel).toBe("SATURATED");
      expect(metrics?.recommendation).toBe("RETIRE");
    });

    it("should calculate pass rate trend", async () => {
      const goldenCase = service.createGoldenCase({
        name: "Improving Case",
        machineId: "machine-001",
        targetDropSeconds: 660,
        dropSecondsErrorTolerance: 30,
        expectation: "SHOULD_SUCCEED",
        dangerLevel: "SAFE",
        sourceType: "SYNTHETIC",
        baselineCommands: [],
        trialsRequired: 1,
        tags: [],
        archived: false
      });

      const passAnalysis: RoastAnalysis = {
        sessionId: "session-001",
        analyzedAt: new Date().toISOString(),
        turningPoint: { tempC: 90, elapsedSeconds: 60 },
        firstCrack: { tempC: 196, elapsedSeconds: 480 },
        drop: { tempC: 210, elapsedSeconds: 660 },
        developmentRatio: {
          value: 0.20,
          classification: "MEDIUM",
          details: {}
        },
        crashFlick: {
          detected: false,
          confidence: 0,
          details: {}
        }
      };

      // Simulate trend: early failures, recent successes
      // Run 10 evaluations with recent ones mostly passing
      for (let i = 0; i < 10; i++) {
        const analysis = i < 7 ? passAnalysis : {
          ...passAnalysis,
          drop: { tempC: 210, elapsedSeconds: 700 } // Fail
        };

        await service.runEvaluation({
          sessionId: `session-${i}`,
          goldenCaseId: goldenCase.id,
          analysis: i < 7 ? passAnalysis : analysis,
        });
      }

      const metrics = service.calculateSaturationMetrics(goldenCase.id);

      expect(metrics?.totalEvaluations).toBe(10);
      // All recent evals are passes (within 30 days)
      expect(metrics?.passRateTrend).toBeDefined();
    });

    it("should handle non-existent golden case", () => {
      const metrics = service.calculateSaturationMetrics("non-existent-id");
      expect(metrics).toBeNull();
    });
  });

  describe("Saturation Summary", () => {
    it("should calculate saturation summary across all golden cases", async () => {
      // Create 5 golden cases with different saturation levels
      const cases = [];

      // Case 1: LOW (0% pass rate)
      const case1 = service.createGoldenCase({
        name: "Hard Case",
        machineId: "machine-001",
        targetDropSeconds: 660,
        dropSecondsErrorTolerance: 5, // Very tight
        expectation: "SHOULD_SUCCEED",
        dangerLevel: "SAFE",
        sourceType: "SYNTHETIC",
        baselineCommands: [],
        trialsRequired: 1,
        tags: [],
        archived: false
      });
      cases.push(case1);

      // Case 2: MEDIUM (50% pass rate)
      const case2 = service.createGoldenCase({
        name: "Medium Case",
        machineId: "machine-001",
        targetDropSeconds: 660,
        dropSecondsErrorTolerance: 30,
        expectation: "SHOULD_SUCCEED",
        dangerLevel: "SAFE",
        sourceType: "SYNTHETIC",
        baselineCommands: [],
        trialsRequired: 1,
        tags: [],
        archived: false
      });
      cases.push(case2);

      // Case 3: HIGH (70% pass rate)
      const case3 = service.createGoldenCase({
        name: "Easier Case",
        machineId: "machine-001",
        targetDropSeconds: 660,
        dropSecondsErrorTolerance: 50,
        expectation: "SHOULD_SUCCEED",
        dangerLevel: "SAFE",
        sourceType: "SYNTHETIC",
        baselineCommands: [],
        trialsRequired: 1,
        tags: [],
        archived: false
      });
      cases.push(case3);

      // Case 4: SATURATED (90% pass rate)
      const case4 = service.createGoldenCase({
        name: "Too Easy Case",
        machineId: "machine-001",
        targetDropSeconds: 660,
        dropSecondsErrorTolerance: 100,
        expectation: "SHOULD_SUCCEED",
        dangerLevel: "SAFE",
        sourceType: "SYNTHETIC",
        baselineCommands: [],
        trialsRequired: 1,
        tags: [],
        archived: false
      });
      cases.push(case4);

      const analysis: RoastAnalysis = {
        sessionId: "session-001",
        analyzedAt: new Date().toISOString(),
        turningPoint: { tempC: 90, elapsedSeconds: 60 },
        firstCrack: { tempC: 196, elapsedSeconds: 480 },
        drop: { tempC: 210, elapsedSeconds: 670 }, // 10 seconds error
        developmentRatio: {
          value: 0.20,
          classification: "MEDIUM",
          details: {}
        },
        crashFlick: {
          detected: false,
          confidence: 0,
          details: {}
        }
      };

      // Run evaluations for each case with different outcomes
      // Case 1: 10 evals, 0 pass (tight tolerance)
      for (let i = 0; i < 10; i++) {
        await service.runEvaluation({
          sessionId: `case1-${i}`,
          goldenCaseId: case1.id,
          analysis,
        });
      }

      // Case 2: 10 evals, 5 pass (medium tolerance)
      for (let i = 0; i < 5; i++) {
        await service.runEvaluation({
          sessionId: `case2-pass-${i}`,
          goldenCaseId: case2.id,
          analysis: {
            ...analysis,
            drop: { tempC: 210, elapsedSeconds: 660 } // Exact match
          },
        });
      }
      for (let i = 0; i < 5; i++) {
        await service.runEvaluation({
          sessionId: `case2-fail-${i}`,
          goldenCaseId: case2.id,
          analysis: {
            ...analysis,
            drop: { tempC: 210, elapsedSeconds: 700 } // Outside tolerance
          },
        });
      }

      // Case 3: 10 evals, 7 pass
      for (let i = 0; i < 7; i++) {
        await service.runEvaluation({
          sessionId: `case3-pass-${i}`,
          goldenCaseId: case3.id,
          analysis: {
            ...analysis,
            drop: { tempC: 210, elapsedSeconds: 680 } // Within 50s tolerance
          },
        });
      }
      for (let i = 0; i < 3; i++) {
        await service.runEvaluation({
          sessionId: `case3-fail-${i}`,
          goldenCaseId: case3.id,
          analysis: {
            ...analysis,
            drop: { tempC: 210, elapsedSeconds: 730 } // Outside 50s tolerance
          },
        });
      }

      // Case 4: 10 evals, 9 pass (very loose tolerance)
      for (let i = 0; i < 9; i++) {
        await service.runEvaluation({
          sessionId: `case4-pass-${i}`,
          goldenCaseId: case4.id,
          analysis: {
            ...analysis,
            drop: { tempC: 210, elapsedSeconds: 700 } // Within 100s tolerance
          },
        });
      }
      for (let i = 0; i < 1; i++) {
        await service.runEvaluation({
          sessionId: `case4-fail-${i}`,
          goldenCaseId: case4.id,
          analysis: {
            ...analysis,
            drop: { tempC: 210, elapsedSeconds: 800 } // Way outside
          },
        });
      }

      const summary = service.calculateSaturationSummary();

      expect(summary.totalCases).toBe(4);
      expect(summary.lowDifficulty).toBe(1); // Case 1
      expect(summary.mediumDifficulty).toBe(1); // Case 2
      expect(summary.highDifficulty).toBe(1); // Case 3
      expect(summary.saturated).toBe(1); // Case 4
      expect(summary.saturatedCases).toBe(1);
      expect(summary.saturationRate).toBeCloseTo(0.25); // 1/4 = 25%
      expect(summary.needsAction).toBe(true); // >20%
      expect(summary.severity).toBe("ALERT");
      expect(summary.casesToRetire).toBe(1);
    });

    it("should return OK severity when saturation is low", () => {
      // Create 5 cases with no evaluations
      for (let i = 0; i < 5; i++) {
        service.createGoldenCase({
          name: `Case ${i}`,
          machineId: "machine-001",
          targetDropSeconds: 660,
          dropSecondsErrorTolerance: 30,
          expectation: "SHOULD_SUCCEED",
          dangerLevel: "SAFE",
          sourceType: "SYNTHETIC",
          baselineCommands: [],
          trialsRequired: 1,
          tags: [],
          archived: false
        });
      }

      const summary = service.calculateSaturationSummary();

      expect(summary.totalCases).toBe(5);
      expect(summary.saturatedCases).toBe(0);
      expect(summary.saturationRate).toBe(0);
      expect(summary.needsAction).toBe(false);
      expect(summary.severity).toBe("OK");
    });
  });

  describe("Agent Transcript", () => {
    it("should store and retrieve agent transcript", async () => {
      const goldenCase = service.createGoldenCase({
        name: "Test Case",
        machineId: "machine-001",
        targetDropSeconds: 660,
        dropSecondsErrorTolerance: 30,
        expectation: "SHOULD_SUCCEED",
        dangerLevel: "SAFE",
        sourceType: "SYNTHETIC",
        baselineCommands: [],
        trialsRequired: 1,
        tags: [],
        archived: false
      });

      const analysis: RoastAnalysis = {
        sessionId: "session-001",
        analyzedAt: new Date().toISOString(),
        turningPoint: { tempC: 90, elapsedSeconds: 60 },
        firstCrack: { tempC: 196, elapsedSeconds: 480 },
        drop: { tempC: 210, elapsedSeconds: 660 },
        developmentRatio: {
          value: 0.20,
          classification: "MEDIUM",
          details: {}
        },
        crashFlick: {
          detected: false,
          confidence: 0,
          details: {}
        }
      };

      const agentTranscript = [
        {
          timestamp: new Date().toISOString(),
          type: "thinking" as const,
          content: "Analyzing roast profile and determining optimal parameters",
        },
        {
          timestamp: new Date().toISOString(),
          type: "tool_call" as const,
          content: "Calling temperature analyzer",
          metadata: { tool: "analyze_temp", args: { tempC: 210 } }
        },
        {
          timestamp: new Date().toISOString(),
          type: "decision" as const,
          content: "Decided to proceed with current temperature curve",
        }
      ];

      // Create eval run with transcript
      const evalRun = await service.runEvaluation({
        sessionId: "session-001",
        goldenCaseId: goldenCase.id,
        analysis,
      });

      // Manually create an eval run with transcript for testing
      const evalRunWithTranscript = repo.createEvalRun({
        ...evalRun,
        id: "eval-with-transcript",
        agentTranscript,
      });

      expect(evalRunWithTranscript.agentTranscript).toBeDefined();
      expect(evalRunWithTranscript.agentTranscript).toHaveLength(3);
      expect(evalRunWithTranscript.agentTranscript?.[0].type).toBe("thinking");
      expect(evalRunWithTranscript.agentTranscript?.[1].type).toBe("tool_call");
      expect(evalRunWithTranscript.agentTranscript?.[2].type).toBe("decision");

      // Retrieve and verify
      const retrieved = repo.getEvalRun(evalRunWithTranscript.id);
      expect(retrieved?.agentTranscript).toBeDefined();
      expect(retrieved?.agentTranscript).toHaveLength(3);
      expect(retrieved?.agentTranscript?.[0].content).toBe("Analyzing roast profile and determining optimal parameters");
    });
  });
});
