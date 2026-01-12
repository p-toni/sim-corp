import type Database from "better-sqlite3";
import type { GoldenCase, EvalRun } from "@sim-corp/schemas";

export interface GoldenCaseFilters {
  machineId?: string;
  archived?: boolean;
  tags?: string[];
  limit?: number;
  offset?: number;
}

export interface EvalRunFilters {
  sessionId?: string;
  goldenCaseId?: string;
  outcome?: string;
  orgId?: string;
  limit?: number;
  offset?: number;
}

export class EvalRepository {
  constructor(private readonly db: Database.Database) {}

  // Golden Cases
  createGoldenCase(goldenCase: GoldenCase): GoldenCase {
    const stmt = this.db.prepare(`
      INSERT INTO golden_cases (
        id, name, description, origin, processing_method, variety, crop_year,
        machine_id, batch_size_kg, charge_temp_c,
        target_fc_seconds, target_drop_seconds, target_dev_percentage,
        target_fc_temp_c, target_drop_temp_c, target_roast_color,
        fc_seconds_tolerance, drop_seconds_tolerance, dev_percentage_tolerance,
        max_ror_spikes, max_ror_crashes,
        sensory_min_score, sensory_notes_json,
        baseline_commands_json,
        trials_required, pass_at_k_threshold,
        expectation, reject_reason_expected, danger_level,
        reference_solution_json,
        source_type, source_session_id, failure_mode,
        created_at, created_by, tags_json, archived, metadata_json
      ) VALUES (
        @id, @name, @description, @origin, @processingMethod, @variety, @cropYear,
        @machineId, @batchSizeKg, @chargeTempC,
        @targetFirstCrackSeconds, @targetDropSeconds, @targetDevelopmentPercentage,
        @targetFCTempC, @targetDropTempC, @targetRoastColor,
        @fcSecondsErrorTolerance, @dropSecondsErrorTolerance, @devPercentageErrorTolerance,
        @maxRorSpikes, @maxRorCrashes,
        @sensoryMinScore, @sensoryNotesJson,
        @baselineCommandsJson,
        @trialsRequired, @passAtKThreshold,
        @expectation, @rejectReasonExpected, @dangerLevel,
        @referenceSolutionJson,
        @sourceType, @sourceSessionId, @failureMode,
        @createdAt, @createdBy, @tagsJson, @archived, @metadataJson
      )
    `);

    stmt.run({
      id: goldenCase.id,
      name: goldenCase.name,
      description: goldenCase.description ?? null,
      origin: goldenCase.origin ?? null,
      processingMethod: goldenCase.processingMethod ?? null,
      variety: goldenCase.variety ?? null,
      cropYear: goldenCase.cropYear ?? null,
      machineId: goldenCase.machineId,
      batchSizeKg: goldenCase.batchSizeKg ?? null,
      chargeTempC: goldenCase.chargeTempC ?? null,
      targetFirstCrackSeconds: goldenCase.targetFirstCrackSeconds ?? null,
      targetDropSeconds: goldenCase.targetDropSeconds ?? null,
      targetDevelopmentPercentage: goldenCase.targetDevelopmentPercentage ?? null,
      targetFCTempC: goldenCase.targetFCTempC ?? null,
      targetDropTempC: goldenCase.targetDropTempC ?? null,
      targetRoastColor: goldenCase.targetRoastColor ?? null,
      fcSecondsErrorTolerance: goldenCase.fcSecondsErrorTolerance ?? null,
      dropSecondsErrorTolerance: goldenCase.dropSecondsErrorTolerance ?? null,
      devPercentageErrorTolerance: goldenCase.devPercentageErrorTolerance ?? null,
      maxRorSpikes: goldenCase.maxRorSpikes ?? null,
      maxRorCrashes: goldenCase.maxRorCrashes ?? null,
      sensoryMinScore: goldenCase.sensoryRange?.minScore ?? null,
      sensoryNotesJson: goldenCase.sensoryRange?.notes ? JSON.stringify(goldenCase.sensoryRange.notes) : null,
      baselineCommandsJson: JSON.stringify(goldenCase.baselineCommands ?? []),
      trialsRequired: goldenCase.trialsRequired ?? 1,
      passAtKThreshold: goldenCase.passAtKThreshold ?? null,
      expectation: goldenCase.expectation ?? "SHOULD_SUCCEED",
      rejectReasonExpected: goldenCase.rejectReasonExpected ?? null,
      dangerLevel: goldenCase.dangerLevel ?? "SAFE",
      referenceSolutionJson: goldenCase.referenceSolution ? JSON.stringify(goldenCase.referenceSolution) : null,
      sourceType: goldenCase.sourceType ?? "SYNTHETIC",
      sourceSessionId: goldenCase.sourceSessionId ?? null,
      failureMode: goldenCase.failureMode ?? null,
      createdAt: goldenCase.createdAt ?? new Date().toISOString(),
      createdBy: goldenCase.createdBy ?? null,
      tagsJson: JSON.stringify(goldenCase.tags ?? []),
      archived: goldenCase.archived ? 1 : 0,
      metadataJson: JSON.stringify(goldenCase.metadata ?? {})
    });

    return goldenCase;
  }

  getGoldenCase(id: string): GoldenCase | null {
    const row = this.db.prepare("SELECT * FROM golden_cases WHERE id = ?").get(id) as any;
    return row ? this.hydrateGoldenCase(row) : null;
  }

  listGoldenCases(filters: GoldenCaseFilters = {}): GoldenCase[] {
    const conditions: string[] = [];
    const params: Record<string, any> = {};

    if (filters.machineId) {
      conditions.push("machine_id = @machineId");
      params.machineId = filters.machineId;
    }

    if (filters.archived !== undefined) {
      conditions.push("archived = @archived");
      params.archived = filters.archived ? 1 : 0;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const sql = `SELECT * FROM golden_cases ${whereClause} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
    const rows = this.db.prepare(sql).all(params) as any[];
    return rows.map((row) => this.hydrateGoldenCase(row));
  }

  updateGoldenCase(id: string, updates: Partial<GoldenCase>): GoldenCase | null {
    const existing = this.getGoldenCase(id);
    if (!existing) return null;

    const merged = { ...existing, ...updates };
    const stmt = this.db.prepare(`
      UPDATE golden_cases SET
        name = @name,
        description = @description,
        archived = @archived,
        tags_json = @tagsJson,
        reference_solution_json = @referenceSolutionJson,
        source_type = @sourceType,
        source_session_id = @sourceSessionId
      WHERE id = @id
    `);

    stmt.run({
      id,
      name: merged.name,
      description: merged.description ?? null,
      archived: merged.archived ? 1 : 0,
      tagsJson: JSON.stringify(merged.tags ?? []),
      referenceSolutionJson: merged.referenceSolution ? JSON.stringify(merged.referenceSolution) : null,
      sourceType: merged.sourceType ?? "SYNTHETIC",
      sourceSessionId: merged.sourceSessionId ?? null
    });

    return this.getGoldenCase(id);
  }

  // Eval Runs
  createEvalRun(evalRun: EvalRun): EvalRun {
    const stmt = this.db.prepare(`
      INSERT INTO eval_runs (
        id, session_id, mission_id, golden_case_id, run_at, evaluator_id,
        trial_number, trial_set_id, total_trials,
        outcome, passed_gates_json, failed_gates_json,
        agent_rejected, rejection_reason, rejection_appropriate,
        detailed_metrics_json, metrics_json, lm_judge_json,
        commands_json,
        agent_transcript_json,
        human_reviewed, human_outcome, human_notes, reviewed_by, reviewed_at,
        org_id, notes, artifacts_json
      ) VALUES (
        @id, @sessionId, @missionId, @goldenCaseId, @runAt, @evaluatorId,
        @trialNumber, @trialSetId, @totalTrials,
        @outcome, @passedGatesJson, @failedGatesJson,
        @agentRejected, @rejectionReason, @rejectionAppropriate,
        @detailedMetricsJson, @metricsJson, @lmJudgeJson,
        @commandsJson,
        @agentTranscriptJson,
        @humanReviewed, @humanOutcome, @humanNotes, @reviewedBy, @reviewedAt,
        @orgId, @notes, @artifactsJson
      )
    `);

    stmt.run({
      id: evalRun.id,
      sessionId: evalRun.sessionId ?? null,
      missionId: evalRun.missionId ?? null,
      goldenCaseId: evalRun.goldenCaseId ?? null,
      runAt: evalRun.runAt,
      evaluatorId: evalRun.evaluatorId ?? null,
      trialNumber: evalRun.trialNumber ?? null,
      trialSetId: evalRun.trialSetId ?? null,
      totalTrials: evalRun.totalTrials ?? null,
      outcome: evalRun.outcome,
      passedGatesJson: JSON.stringify(evalRun.passedGates ?? []),
      failedGatesJson: JSON.stringify(evalRun.failedGates ?? []),
      agentRejected: evalRun.agentRejected ? 1 : 0,
      rejectionReason: evalRun.rejectionReason ?? null,
      rejectionAppropriate: evalRun.rejectionAppropriate !== undefined ? (evalRun.rejectionAppropriate ? 1 : 0) : null,
      detailedMetricsJson: evalRun.detailedMetrics ? JSON.stringify(evalRun.detailedMetrics) : null,
      metricsJson: JSON.stringify(evalRun.metrics ?? []),
      lmJudgeJson: evalRun.lmJudge ? JSON.stringify(evalRun.lmJudge) : null,
      commandsJson: JSON.stringify(evalRun.commands ?? []),
      agentTranscriptJson: evalRun.agentTranscript ? JSON.stringify(evalRun.agentTranscript) : null,
      humanReviewed: evalRun.humanReviewed ? 1 : 0,
      humanOutcome: evalRun.humanOutcome ?? null,
      humanNotes: evalRun.humanNotes ?? null,
      reviewedBy: evalRun.reviewedBy ?? null,
      reviewedAt: evalRun.reviewedAt ?? null,
      orgId: evalRun.orgId ?? null,
      notes: evalRun.notes ?? null,
      artifactsJson: JSON.stringify(evalRun.artifacts ?? [])
    });

    return evalRun;
  }

  getEvalRun(id: string): EvalRun | null {
    const row = this.db.prepare("SELECT * FROM eval_runs WHERE id = ?").get(id) as any;
    return row ? this.hydrateEvalRun(row) : null;
  }

  listEvalRuns(filters: EvalRunFilters = {}): EvalRun[] {
    const conditions: string[] = [];
    const params: Record<string, any> = {};

    if (filters.sessionId) {
      conditions.push("session_id = @sessionId");
      params.sessionId = filters.sessionId;
    }

    if (filters.goldenCaseId) {
      conditions.push("golden_case_id = @goldenCaseId");
      params.goldenCaseId = filters.goldenCaseId;
    }

    if (filters.outcome) {
      conditions.push("outcome = @outcome");
      params.outcome = filters.outcome;
    }

    if (filters.orgId) {
      conditions.push("org_id = @orgId");
      params.orgId = filters.orgId;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const sql = `SELECT * FROM eval_runs ${whereClause} ORDER BY run_at DESC LIMIT ${limit} OFFSET ${offset}`;
    const rows = this.db.prepare(sql).all(params) as any[];
    return rows.map((row) => this.hydrateEvalRun(row));
  }

  private hydrateGoldenCase(row: any): GoldenCase {
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      origin: row.origin ?? undefined,
      processingMethod: row.processing_method ?? undefined,
      variety: row.variety ?? undefined,
      cropYear: row.crop_year ?? undefined,
      machineId: row.machine_id,
      batchSizeKg: row.batch_size_kg ?? undefined,
      chargeTempC: row.charge_temp_c ?? undefined,
      targetFirstCrackSeconds: row.target_fc_seconds ?? undefined,
      targetDropSeconds: row.target_drop_seconds ?? undefined,
      targetDevelopmentPercentage: row.target_dev_percentage ?? undefined,
      targetFCTempC: row.target_fc_temp_c ?? undefined,
      targetDropTempC: row.target_drop_temp_c ?? undefined,
      targetRoastColor: row.target_roast_color ?? undefined,
      fcSecondsErrorTolerance: row.fc_seconds_tolerance ?? undefined,
      dropSecondsErrorTolerance: row.drop_seconds_tolerance ?? undefined,
      devPercentageErrorTolerance: row.dev_percentage_tolerance ?? undefined,
      maxRorSpikes: row.max_ror_spikes ?? undefined,
      maxRorCrashes: row.max_ror_crashes ?? undefined,
      sensoryRange: row.sensory_min_score || row.sensory_notes_json ? {
        minScore: row.sensory_min_score ?? undefined,
        notes: row.sensory_notes_json ? JSON.parse(row.sensory_notes_json) : []
      } : undefined,
      baselineCommands: JSON.parse(row.baseline_commands_json ?? "[]"),
      trialsRequired: row.trials_required ?? 1,
      passAtKThreshold: row.pass_at_k_threshold ?? undefined,
      expectation: row.expectation ?? "SHOULD_SUCCEED",
      rejectReasonExpected: row.reject_reason_expected ?? undefined,
      dangerLevel: row.danger_level ?? "SAFE",
      referenceSolution: row.reference_solution_json ? JSON.parse(row.reference_solution_json) : undefined,
      sourceType: row.source_type ?? "SYNTHETIC",
      sourceSessionId: row.source_session_id ?? undefined,
      failureMode: row.failure_mode ?? undefined,
      createdAt: row.created_at ?? undefined,
      createdBy: row.created_by ?? undefined,
      tags: JSON.parse(row.tags_json ?? "[]"),
      archived: row.archived === 1,
      metadata: JSON.parse(row.metadata_json ?? "{}")
    };
  }

  private hydrateEvalRun(row: any): EvalRun {
    return {
      id: row.id,
      sessionId: row.session_id ?? undefined,
      missionId: row.mission_id ?? undefined,
      goldenCaseId: row.golden_case_id ?? undefined,
      runAt: row.run_at,
      evaluatorId: row.evaluator_id ?? undefined,
      trialNumber: row.trial_number ?? undefined,
      trialSetId: row.trial_set_id ?? undefined,
      totalTrials: row.total_trials ?? undefined,
      outcome: row.outcome as any,
      passedGates: JSON.parse(row.passed_gates_json ?? "[]"),
      failedGates: JSON.parse(row.failed_gates_json ?? "[]"),
      agentRejected: row.agent_rejected === 1,
      rejectionReason: row.rejection_reason ?? undefined,
      rejectionAppropriate: row.rejection_appropriate !== null ? row.rejection_appropriate === 1 : undefined,
      detailedMetrics: row.detailed_metrics_json ? JSON.parse(row.detailed_metrics_json) : undefined,
      metrics: JSON.parse(row.metrics_json ?? "[]"),
      lmJudge: row.lm_judge_json ? JSON.parse(row.lm_judge_json) : undefined,
      commands: JSON.parse(row.commands_json ?? "[]"),
      agentTranscript: row.agent_transcript_json ? JSON.parse(row.agent_transcript_json) : undefined,
      humanReviewed: row.human_reviewed === 1,
      humanOutcome: row.human_outcome ?? undefined,
      humanNotes: row.human_notes ?? undefined,
      reviewedBy: row.reviewed_by ?? undefined,
      reviewedAt: row.reviewed_at ?? undefined,
      orgId: row.org_id ?? undefined,
      notes: row.notes ?? undefined,
      artifacts: JSON.parse(row.artifacts_json ?? "[]")
    };
  }
}
