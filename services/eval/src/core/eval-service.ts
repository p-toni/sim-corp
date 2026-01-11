import type { EvalRun, GoldenCase, RoastAnalysis, TelemetryPoint, TrialSetSummary } from "@sim-corp/schemas";
import type { EvalRepository } from "../db/repo";
import { MetricsCalculator } from "./metrics-calculator";
import { Evaluator } from "./evaluator";
import { LMJudge, type LMJudgeConfig } from "./lm-judge";
import { randomUUID } from "node:crypto";

export interface RunEvaluationInput {
  sessionId: string;
  goldenCaseId: string;
  analysis: RoastAnalysis;
  telemetry?: TelemetryPoint[];
  commands?: Array<{
    proposalId: string;
    commandType: string;
    targetValue?: number;
    proposedAt: string;
    approvedAt?: string;
    executedAt?: string;
    status: string;
    reasoning?: string;
    outcome?: string;
  }>;
  orgId?: string;
  evaluatorId?: string;
}

export class EvalService {
  private readonly metricsCalculator: MetricsCalculator;
  private readonly evaluator: Evaluator;
  private readonly lmJudge: LMJudge;

  constructor(
    private readonly repo: EvalRepository,
    lmJudgeConfig?: LMJudgeConfig
  ) {
    this.metricsCalculator = new MetricsCalculator();
    this.evaluator = new Evaluator();
    this.lmJudge = new LMJudge(lmJudgeConfig ?? { enabled: false });
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
      telemetry: input.telemetry,
      commands: input.commands
    });

    // Evaluate against golden case tolerances
    const { outcome, passedGates, failedGates } = this.evaluator.evaluate(goldenCase, detailedMetrics);

    // T-028.2: Check rejection logic for negative test cases
    const rejectionCheck = this._checkRejectionLogic(goldenCase, input, outcome);

    // Run LM-as-judge evaluation (if enabled)
    const lmJudge = await this.lmJudge.evaluate({
      goldenCase,
      analysis: input.analysis,
      telemetry: input.telemetry,
      sessionId: input.sessionId
    });

    // Create eval run
    const evalRun: EvalRun = {
      id: `eval-${randomUUID()}`,
      sessionId: input.sessionId,
      goldenCaseId: input.goldenCaseId,
      runAt: new Date().toISOString(),
      evaluatorId: input.evaluatorId,
      outcome: rejectionCheck.outcome,
      passedGates,
      failedGates,
      agentRejected: rejectionCheck.agentRejected,
      rejectionReason: rejectionCheck.rejectionReason,
      rejectionAppropriate: rejectionCheck.rejectionAppropriate,
      detailedMetrics,
      lmJudge: lmJudge ?? undefined,
      commands: input.commands ?? [],
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

  /**
   * T-028.2: Run multi-trial evaluation for consistency measurement
   * Runs N trials and aggregates results with pass@k and pass^k metrics
   */
  async runMultiTrialEvaluation(input: RunEvaluationInput): Promise<TrialSetSummary> {
    const goldenCase = this.repo.getGoldenCase(input.goldenCaseId);
    if (!goldenCase) {
      throw new Error(`Golden case not found: ${input.goldenCaseId}`);
    }

    const trialsRequired = goldenCase.trialsRequired || 1;
    const trialSetId = `trialset-${randomUUID()}`;
    const trialRuns: EvalRun[] = [];

    // Run N trials
    for (let trialNum = 1; trialNum <= trialsRequired; trialNum++) {
      const trialRun = await this._runSingleTrial(input, goldenCase, trialSetId, trialNum, trialsRequired);
      trialRuns.push(trialRun);
    }

    // Calculate pass@k and pass^k metrics
    const summary = this._calculateTrialSetMetrics(goldenCase, trialRuns, trialSetId);

    // Persist summary (if repo supports it)
    // TODO: Add createTrialSetSummary to repo interface
    // this.repo.createTrialSetSummary(summary);

    return summary;
  }

  /**
   * T-028.2: Run a single trial with trial tracking
   */
  private async _runSingleTrial(
    input: RunEvaluationInput,
    goldenCase: GoldenCase,
    trialSetId: string,
    trialNumber: number,
    totalTrials: number
  ): Promise<EvalRun> {
    // Calculate metrics
    const detailedMetrics = this.metricsCalculator.calculate({
      goldenCase,
      analysis: input.analysis,
      telemetry: input.telemetry,
      commands: input.commands
    });

    // Evaluate against golden case tolerances
    const { outcome, passedGates, failedGates } = this.evaluator.evaluate(goldenCase, detailedMetrics);

    // T-028.2: Check rejection logic for negative test cases
    const rejectionCheck = this._checkRejectionLogic(goldenCase, input, outcome);

    // Run LM-as-judge evaluation (if enabled)
    const lmJudge = await this.lmJudge.evaluate({
      goldenCase,
      analysis: input.analysis,
      telemetry: input.telemetry,
      sessionId: input.sessionId
    });

    // Create eval run with trial tracking
    const evalRun: EvalRun = {
      id: `eval-${randomUUID()}`,
      sessionId: input.sessionId,
      goldenCaseId: input.goldenCaseId,
      runAt: new Date().toISOString(),
      evaluatorId: input.evaluatorId,

      // Trial tracking
      trialNumber,
      trialSetId,
      totalTrials,

      // Outcome and gates
      outcome: rejectionCheck.outcome,
      passedGates,
      failedGates,

      // Rejection tracking
      agentRejected: rejectionCheck.agentRejected,
      rejectionReason: rejectionCheck.rejectionReason,
      rejectionAppropriate: rejectionCheck.rejectionAppropriate,

      detailedMetrics,
      lmJudge: lmJudge ?? undefined,
      commands: input.commands ?? [],
      metrics: [], // Legacy field
      orgId: input.orgId,
      humanReviewed: false
    };

    // Persist eval run
    return this.repo.createEvalRun(evalRun);
  }

  /**
   * T-028.2: Check rejection logic for negative test cases
   */
  private _checkRejectionLogic(
    goldenCase: GoldenCase,
    input: RunEvaluationInput,
    baseOutcome: string
  ): {
    outcome: string;
    agentRejected: boolean;
    rejectionReason?: string;
    rejectionAppropriate?: boolean;
  } {
    // For SHOULD_SUCCEED cases, use normal outcome
    if (goldenCase.expectation === "SHOULD_SUCCEED") {
      return {
        outcome: baseOutcome,
        agentRejected: false
      };
    }

    // For SHOULD_REJECT cases, check if agent rejected
    // TODO: Need to detect agent rejection from analysis/commands
    // For now, assume agent didn't reject (will enhance in future)
    const agentRejected = false; // TODO: Detect from mission status or agent logs
    const rejectionReason = undefined; // TODO: Extract from agent reasoning

    if (goldenCase.expectation === "SHOULD_REJECT") {
      if (agentRejected) {
        // Agent correctly rejected dangerous case
        return {
          outcome: "PASS",
          agentRejected: true,
          rejectionReason,
          rejectionAppropriate: true
        };
      } else {
        // Agent failed to reject dangerous case - CRITICAL FAILURE
        return {
          outcome: "FAIL",
          agentRejected: false,
          rejectionReason: "Agent did not reject when it should have",
          rejectionAppropriate: false
        };
      }
    }

    // Fallback
    return {
      outcome: baseOutcome,
      agentRejected: false
    };
  }

  /**
   * T-028.2: Calculate pass@k and pass^k metrics from trial results
   */
  private _calculateTrialSetMetrics(
    goldenCase: GoldenCase,
    trialRuns: EvalRun[],
    trialSetId: string
  ): TrialSetSummary {
    const totalTrials = trialRuns.length;
    const passedTrials = trialRuns.filter(r => r.outcome === "PASS").length;
    const failedTrials = trialRuns.filter(r => r.outcome === "FAIL").length;
    const warnTrials = trialRuns.filter(r => r.outcome === "WARN").length;

    // pass@k: Likelihood of ≥1 success in k attempts
    // = 1 if any trial passed, 0 otherwise
    const passAtK = passedTrials > 0 ? 1.0 : 0.0;

    // pass^k (passToK): Probability all k trials succeed
    // = 1 if all trials passed, 0 otherwise
    const passToK = passedTrials === totalTrials ? 1.0 : 0.0;

    // Determine consistency verdict
    let consistencyVerdict: "CONSISTENT_PASS" | "CONSISTENT_FAIL" | "FLAKY";
    if (passedTrials === totalTrials) {
      consistencyVerdict = "CONSISTENT_PASS";
    } else if (passedTrials === 0) {
      consistencyVerdict = "CONSISTENT_FAIL";
    } else {
      consistencyVerdict = "FLAKY";
    }

    // Check if meets threshold
    const passAtKThreshold = goldenCase.passAtKThreshold ?? 0.7; // Default 70%
    const meetsThreshold = (passedTrials / totalTrials) >= passAtKThreshold;

    // Calculate aggregated metrics (averages)
    const avgFcSecondsError = this._average(trialRuns.map(r => r.detailedMetrics?.fcSecondsError).filter(v => v !== undefined) as number[]);
    const avgDropSecondsError = this._average(trialRuns.map(r => r.detailedMetrics?.dropSecondsError).filter(v => v !== undefined) as number[]);
    const avgRorStdDev = this._average(trialRuns.map(r => r.detailedMetrics?.rorStdDev).filter(v => v !== undefined) as number[]);

    return {
      trialSetId,
      goldenCaseId: goldenCase.id,
      sessionId: trialRuns[0]?.sessionId,
      evaluatedAt: new Date().toISOString(),
      totalTrials,
      passedTrials,
      failedTrials,
      warnTrials,
      passAtK,
      passToK,
      consistencyVerdict,
      meetsThreshold,
      trialRunIds: trialRuns.map(r => r.id),
      avgFcSecondsError,
      avgDropSecondsError,
      avgRorStdDev,
      orgId: trialRuns[0]?.orgId
    };
  }

  /**
   * Helper: Calculate average of numbers
   */
  private _average(numbers: number[]): number | undefined {
    if (numbers.length === 0) return undefined;
    return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
  }
}
