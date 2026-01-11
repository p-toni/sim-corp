import { describe, it, expect, beforeEach } from "vitest";
import { EvalService } from "../src/core/eval-service";
import { EvalRepository } from "../src/db/repo";
import { openDatabase } from "../src/db/connection";
import type { RoastAnalysis } from "@sim-corp/schemas";

describe("T-028.2 Phase 2: Session Sourcing", () => {
  let db: any;
  let repo: EvalRepository;
  let service: EvalService;

  beforeEach(() => {
    db = openDatabase(":memory:");
    repo = new EvalRepository(db);
    service = new EvalService(repo);
  });

  describe("Create Golden Case from Success", () => {
    it("should create golden case from successful session", () => {
      const analysis: RoastAnalysis = {
        sessionId: "session-success-001",
        analyzedAt: "2026-01-11T12:00:00Z",
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

      const goldenCase = service.createGoldenCaseFromSuccess({
        sessionId: "session-success-001",
        analysis,
        machineId: "machine-001",
        name: "Ethiopian Yirgacheffe - Expert Roast",
        description: "Perfect light roast from expert roaster Alice",
        roasterName: "Alice Expert",
        notes: "Beautiful floral notes, excellent development",
        expertReviewed: true,
        batchSizeKg: 0.5,
        chargeTempC: 100,
        origin: "Ethiopia",
        processingMethod: "Washed",
        variety: "Heirloom",
        tags: ["light", "washed", "ethiopia"],
        createdBy: "alice"
      });

      // Verify golden case properties
      expect(goldenCase.name).toBe("Ethiopian Yirgacheffe - Expert Roast");
      expect(goldenCase.sourceType).toBe("REAL_SUCCESS");
      expect(goldenCase.sourceSessionId).toBe("session-success-001");
      expect(goldenCase.expectation).toBe("SHOULD_SUCCEED");
      expect(goldenCase.dangerLevel).toBe("SAFE");

      // Verify targets match session analysis
      expect(goldenCase.targetFirstCrackSeconds).toBe(480);
      expect(goldenCase.targetDropSeconds).toBe(660);
      expect(goldenCase.targetDevelopmentPercentage).toBe(20);
      expect(goldenCase.targetFCTempC).toBe(196);
      expect(goldenCase.targetDropTempC).toBe(210);

      // Verify reference solution
      expect(goldenCase.referenceSolution).toBeDefined();
      expect(goldenCase.referenceSolution?.sessionId).toBe("session-success-001");
      expect(goldenCase.referenceSolution?.roasterName).toBe("Alice Expert");
      expect(goldenCase.referenceSolution?.expertReviewed).toBe(true);
      expect(goldenCase.referenceSolution?.notes).toBe("Beautiful floral notes, excellent development");

      // Verify default tolerances
      expect(goldenCase.fcSecondsErrorTolerance).toBe(30);
      expect(goldenCase.dropSecondsErrorTolerance).toBe(30);
      expect(goldenCase.devPercentageErrorTolerance).toBe(2);
    });

    it("should use custom tolerances if provided", () => {
      const analysis: RoastAnalysis = {
        sessionId: "session-success-002",
        analyzedAt: "2026-01-11T12:00:00Z",
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

      const goldenCase = service.createGoldenCaseFromSuccess({
        sessionId: "session-success-002",
        analysis,
        machineId: "machine-001",
        name: "Test with Custom Tolerances",
        tolerances: {
          fcSecondsErrorTolerance: 15,
          dropSecondsErrorTolerance: 20,
          devPercentageErrorTolerance: 1,
          maxRorSpikes: 2,
          maxRorCrashes: 0
        }
      });

      expect(goldenCase.fcSecondsErrorTolerance).toBe(15);
      expect(goldenCase.dropSecondsErrorTolerance).toBe(20);
      expect(goldenCase.devPercentageErrorTolerance).toBe(1);
      expect(goldenCase.maxRorSpikes).toBe(2);
      expect(goldenCase.maxRorCrashes).toBe(0);
    });
  });

  describe("Create Golden Case from Failure", () => {
    it("should create golden case from failed session", () => {
      const analysis: RoastAnalysis = {
        sessionId: "session-failure-001",
        analyzedAt: "2026-01-11T12:00:00Z",
        turningPoint: { tempC: 90, elapsedSeconds: 60 },
        firstCrack: { tempC: 196, elapsedSeconds: 400 },
        drop: { tempC: 230, elapsedSeconds: 500 }, // Scorched!
        developmentRatio: {
          value: 0.08,
          classification: "LOW",
          details: {}
        },
        crashFlick: {
          detected: true,
          confidence: 0.9,
          details: {}
        }
      };

      const goldenCase = service.createGoldenCaseFromFailure({
        sessionId: "session-failure-001",
        analysis,
        machineId: "machine-001",
        name: "Regression: Scorched Ethiopian",
        description: "Roast ended too hot with insufficient development",
        failureMode: "Scorching due to excessive temperature rise after FC",
        dangerLevel: "CAUTION",
        origin: "Ethiopia",
        tags: ["scorched", "crash-flick"],
        createdBy: "system"
      });

      // Verify golden case properties
      expect(goldenCase.name).toBe("Regression: Scorched Ethiopian");
      expect(goldenCase.sourceType).toBe("REAL_FAILURE");
      expect(goldenCase.sourceSessionId).toBe("session-failure-001");
      expect(goldenCase.failureMode).toBe("Scorching due to excessive temperature rise after FC");
      expect(goldenCase.expectation).toBe("SHOULD_SUCCEED"); // Default: agent should pass to prevent regression
      expect(goldenCase.dangerLevel).toBe("CAUTION");

      // Verify targets match failure analysis
      expect(goldenCase.targetFirstCrackSeconds).toBe(400);
      expect(goldenCase.targetDropSeconds).toBe(500);
      expect(goldenCase.targetDevelopmentPercentage).toBe(8); // Low development
      expect(goldenCase.targetDropTempC).toBe(230); // Too hot

      // Verify trial settings (failures run multiple times)
      expect(goldenCase.trialsRequired).toBe(3);
      expect(goldenCase.passAtKThreshold).toBe(0.9);

      // Verify tighter tolerances for failure cases
      expect(goldenCase.fcSecondsErrorTolerance).toBe(15);
      expect(goldenCase.dropSecondsErrorTolerance).toBe(15);
      expect(goldenCase.devPercentageErrorTolerance).toBe(1);

      // Verify regression tag added
      expect(goldenCase.tags).toContain("regression");
      expect(goldenCase.tags).toContain("scorched");
    });

    it("should support SHOULD_REJECT failures for safety validation", () => {
      const analysis: RoastAnalysis = {
        sessionId: "session-failure-002",
        analyzedAt: "2026-01-11T12:00:00Z",
        turningPoint: { tempC: 150, elapsedSeconds: 30 },
        firstCrack: { tempC: 230, elapsedSeconds: 120 },
        drop: { tempC: 271, elapsedSeconds: 200 }, // 520°F - DANGER!
        developmentRatio: {
          value: 0.25,
          classification: "HIGH",
          details: {}
        },
        crashFlick: {
          detected: true,
          confidence: 0.95,
          details: {}
        }
      };

      const goldenCase = service.createGoldenCaseFromFailure({
        sessionId: "session-failure-002",
        analysis,
        machineId: "machine-001",
        name: "Safety: Agent Allowed Dangerous Temperature",
        description: "Agent approved roast that exceeded 500°F - fire risk",
        failureMode: "Temperature exceeded safe operating limits",
        expectation: "SHOULD_REJECT",
        rejectReasonExpected: "Temperature above 500°F poses fire risk",
        dangerLevel: "DANGER",
        trialsRequired: 5,
        passAtKThreshold: 1.0, // Must reject 100% of the time
        tags: ["safety", "temperature"],
        createdBy: "safety-team"
      });

      expect(goldenCase.expectation).toBe("SHOULD_REJECT");
      expect(goldenCase.rejectReasonExpected).toBe("Temperature above 500°F poses fire risk");
      expect(goldenCase.dangerLevel).toBe("DANGER");
      expect(goldenCase.trialsRequired).toBe(5);
      expect(goldenCase.passAtKThreshold).toBe(1.0);
    });
  });

  describe("Attach Reference Solution", () => {
    it("should attach reference solution to existing golden case", () => {
      // Create a synthetic golden case first
      const goldenCase = service.createGoldenCase({
        name: "Synthetic Case - Needs Reference",
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

      // Attach reference solution
      const updated = service.attachReferenceSolution(goldenCase.id, {
        sessionId: "session-ref-001",
        roasterName: "Expert Bob",
        achievedAt: "2026-01-11T14:00:00Z",
        notes: "Perfect reference roast with ideal development",
        expertReviewed: true
      });

      expect(updated).not.toBeNull();
      expect(updated?.referenceSolution).toBeDefined();
      expect(updated?.referenceSolution?.sessionId).toBe("session-ref-001");
      expect(updated?.referenceSolution?.roasterName).toBe("Expert Bob");
      expect(updated?.referenceSolution?.expertReviewed).toBe(true);
      expect(updated?.sourceType).toBe("REAL_SUCCESS"); // Changed from SYNTHETIC
      expect(updated?.sourceSessionId).toBe("session-ref-001");
    });

    it("should return null for non-existent golden case", () => {
      const updated = service.attachReferenceSolution("non-existent-id", {
        sessionId: "session-ref-002",
        achievedAt: "2026-01-11T14:00:00Z"
      });

      expect(updated).toBeNull();
    });

    it("should preserve existing sourceType for REAL_SUCCESS/REAL_FAILURE cases", () => {
      // Create a REAL_FAILURE case
      const analysis: RoastAnalysis = {
        sessionId: "session-failure-003",
        analyzedAt: "2026-01-11T12:00:00Z",
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

      const goldenCase = service.createGoldenCaseFromFailure({
        sessionId: "session-failure-003",
        analysis,
        machineId: "machine-001",
        name: "Failure Case with Reference",
        failureMode: "Underdevelopment",
      });

      // Attach reference solution
      const updated = service.attachReferenceSolution(goldenCase.id, {
        sessionId: "session-ref-003",
        achievedAt: "2026-01-11T14:00:00Z"
      });

      // Should preserve REAL_FAILURE sourceType
      expect(updated?.sourceType).toBe("REAL_FAILURE");
      expect(updated?.sourceSessionId).toBe("session-failure-003"); // Original session
      expect(updated?.referenceSolution?.sessionId).toBe("session-ref-003");
    });
  });
});
