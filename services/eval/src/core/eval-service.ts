import type { EvalRun, GoldenCase, RoastAnalysis, TelemetryPoint } from "@sim-corp/schemas";
import type { EvalRepository } from "../db/repo";
import { MetricsCalculator } from "./metrics-calculator";
import { Evaluator } from "./evaluator";
import { randomUUID } from "node:crypto";

export interface RunEvaluationInput {
  sessionId: string;
  goldenCaseId: string;
  analysis: RoastAnalysis;
  telemetry?: TelemetryPoint[];
  orgId?: string;
  evaluatorId?: string;
}

export class EvalService {
  private readonly metricsCalculator: MetricsCalculator;
  private readonly evaluator: Evaluator;

  constructor(private readonly repo: EvalRepository) {
    this.metricsCalculator = new MetricsCalculator();
    this.evaluator = new Evaluator();
  }

  /**
   * Run an evaluation of a session against a golden case
   */
  async runEvaluation(input: RunEvaluationInput): Promise<EvalRun> {
    const goldenCase = this.repo.getGoldenCase(input.goldenCaseId);
    if (!goldenCase) {
      throw new Error(`Golden case not found: ${input.goldenCaseId}`);
    }

    // Calculate metrics
    const detailedMetrics = this.metricsCalculator.calculate({
      goldenCase,
      analysis: input.analysis,
      telemetry: input.telemetry
    });

    // Evaluate against golden case tolerances
    const { outcome, passedGates, failedGates } = this.evaluator.evaluate(goldenCase, detailedMetrics);

    // Create eval run
    const evalRun: EvalRun = {
      id: `eval-${randomUUID()}`,
      sessionId: input.sessionId,
      goldenCaseId: input.goldenCaseId,
      runAt: new Date().toISOString(),
      evaluatorId: input.evaluatorId,
      outcome,
      passedGates,
      failedGates,
      detailedMetrics,
      metrics: [], // Legacy field
      orgId: input.orgId,
      humanReviewed: false
    };

    // Persist eval run
    return this.repo.createEvalRun(evalRun);
  }

  /**
   * Get evaluation results for a session
   */
  getSessionEvaluations(sessionId: string): EvalRun[] {
    return this.repo.listEvalRuns({ sessionId });
  }

  /**
   * Get all evaluations for a golden case
   */
  getGoldenCaseEvaluations(goldenCaseId: string): EvalRun[] {
    return this.repo.listEvalRuns({ goldenCaseId });
  }

  /**
   * Check if a session meets promotion criteria
   */
  canPromote(sessionId: string): { allowed: boolean; reason?: string } {
    const evaluations = this.getSessionEvaluations(sessionId);

    if (evaluations.length === 0) {
      return { allowed: false, reason: "No evaluations found" };
    }

    // Require at least one PASS evaluation
    const hasPass = evaluations.some((e) => e.outcome === "PASS");
    if (!hasPass) {
      return { allowed: false, reason: "No passing evaluations" };
    }

    // Check for any FAIL evaluations
    const hasFail = evaluations.some((e) => e.outcome === "FAIL");
    if (hasFail) {
      return { allowed: false, reason: "Failed evaluations present" };
    }

    return { allowed: true };
  }

  /**
   * Create a new golden case
   */
  createGoldenCase(goldenCase: Omit<GoldenCase, "id">): GoldenCase {
    const withId: GoldenCase = {
      ...goldenCase,
      id: `golden-${randomUUID()}`,
      createdAt: goldenCase.createdAt ?? new Date().toISOString()
    };
    return this.repo.createGoldenCase(withId);
  }

  /**
   * List golden cases
   */
  listGoldenCases(filters?: { machineId?: string; archived?: boolean }): GoldenCase[] {
    return this.repo.listGoldenCases(filters);
  }

  /**
   * Get a specific golden case
   */
  getGoldenCase(id: string): GoldenCase | null {
    return this.repo.getGoldenCase(id);
  }
}
