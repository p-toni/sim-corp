import type { Database } from "@sim-corp/database";
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
  constructor(private readonly db: Database) {}

  // Golden Cases
  async createGoldenCase(goldenCase: GoldenCase): Promise<GoldenCase> {
    await this.db.exec(`
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
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?,
        ?,
        ?, ?,
        ?, ?, ?,
        ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?
      )
    `, [
      goldenCase.id,
      goldenCase.name,
      goldenCase.description ?? null,
      goldenCase.origin ?? null,
      goldenCase.processingMethod ?? null,
      goldenCase.variety ?? null,
      goldenCase.cropYear ?? null,
      goldenCase.machineId,
      goldenCase.batchSizeKg ?? null,
      goldenCase.chargeTempC ?? null,
      goldenCase.targetFirstCrackSeconds ?? null,
      goldenCase.targetDropSeconds ?? null,
      goldenCase.targetDevelopmentPercentage ?? null,
      goldenCase.targetFCTempC ?? null,
      goldenCase.targetDropTempC ?? null,
      goldenCase.targetRoastColor ?? null,
      goldenCase.fcSecondsErrorTolerance ?? null,
      goldenCase.dropSecondsErrorTolerance ?? null,
      goldenCase.devPercentageErrorTolerance ?? null,
      goldenCase.maxRorSpikes ?? null,
      goldenCase.maxRorCrashes ?? null,
      goldenCase.sensoryRange?.minScore ?? null,
      goldenCase.sensoryRange?.notes ? JSON.stringify(goldenCase.sensoryRange.notes) : null,
      JSON.stringify(goldenCase.baselineCommands ?? []),
      goldenCase.trialsRequired ?? 1,
      goldenCase.passAtKThreshold ?? null,
      goldenCase.expectation ?? "SHOULD_SUCCEED",
      goldenCase.rejectReasonExpected ?? null,
      goldenCase.dangerLevel ?? "SAFE",
      goldenCase.referenceSolution ? JSON.stringify(goldenCase.referenceSolution) : null,
      goldenCase.sourceType ?? "SYNTHETIC",
      goldenCase.sourceSessionId ?? null,
      goldenCase.failureMode ?? null,
      goldenCase.createdAt ?? new Date().toISOString(),
      goldenCase.createdBy ?? null,
      JSON.stringify(goldenCase.tags ?? []),
      goldenCase.archived ? 1 : 0,
      JSON.stringify(goldenCase.metadata ?? {})
    ]);

    return goldenCase;
  }

  async getGoldenCase(id: string): Promise<GoldenCase | null> {
    const result = await this.db.query("SELECT * FROM golden_cases WHERE id = ?", [id]);
    return result.rows.length > 0 ? this.hydrateGoldenCase(result.rows[0]) : null;
  }

  async listGoldenCases(filters: GoldenCaseFilters = {}): Promise<GoldenCase[]> {
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters.machineId) {
      conditions.push("machine_id = ?");
      params.push(filters.machineId);
    }

    if (filters.archived !== undefined) {
      conditions.push("archived = ?");
      params.push(filters.archived ? 1 : 0);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const sql = `SELECT * FROM golden_cases ${whereClause} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
    const result = await this.db.query(sql, params);
    return result.rows.map((row: any) => this.hydrateGoldenCase(row));
  }

  async updateGoldenCase(id: string, updates: Partial<GoldenCase>): Promise<GoldenCase | null> {
    const existing = await this.getGoldenCase(id);
    if (!existing) return null;

    const merged = { ...existing, ...updates };

    await this.db.exec(`
      UPDATE golden_cases SET
        name = ?,
        description = ?,
        archived = ?,
        tags_json = ?,
        reference_solution_json = ?,
        source_type = ?,
        source_session_id = ?
      WHERE id = ?
    `, [
      merged.name,
      merged.description ?? null,
      merged.archived ? 1 : 0,
      JSON.stringify(merged.tags ?? []),
      merged.referenceSolution ? JSON.stringify(merged.referenceSolution) : null,
      merged.sourceType ?? "SYNTHETIC",
      merged.sourceSessionId ?? null,
      id
    ]);

    return this.getGoldenCase(id);
  }

  // Eval Runs
  async createEvalRun(evalRun: EvalRun): Promise<EvalRun> {
    await this.db.exec(`
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
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?,
        ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?
      )
    `, [
      evalRun.id,
      evalRun.sessionId ?? null,
      evalRun.missionId ?? null,
      evalRun.goldenCaseId ?? null,
      evalRun.runAt,
      evalRun.evaluatorId ?? null,
      evalRun.trialNumber ?? null,
      evalRun.trialSetId ?? null,
      evalRun.totalTrials ?? null,
      evalRun.outcome,
      JSON.stringify(evalRun.passedGates ?? []),
      JSON.stringify(evalRun.failedGates ?? []),
      evalRun.agentRejected ? 1 : 0,
      evalRun.rejectionReason ?? null,
      evalRun.rejectionAppropriate !== undefined ? (evalRun.rejectionAppropriate ? 1 : 0) : null,
      evalRun.detailedMetrics ? JSON.stringify(evalRun.detailedMetrics) : null,
      JSON.stringify(evalRun.metrics ?? []),
      evalRun.lmJudge ? JSON.stringify(evalRun.lmJudge) : null,
      JSON.stringify(evalRun.commands ?? []),
      evalRun.agentTranscript ? JSON.stringify(evalRun.agentTranscript) : null,
      evalRun.humanReviewed ? 1 : 0,
      evalRun.humanOutcome ?? null,
      evalRun.humanNotes ?? null,
      evalRun.reviewedBy ?? null,
      evalRun.reviewedAt ?? null,
      evalRun.orgId ?? null,
      evalRun.notes ?? null,
      JSON.stringify(evalRun.artifacts ?? [])
    ]);

    return evalRun;
  }

  async getEvalRun(id: string): Promise<EvalRun | null> {
    const result = await this.db.query("SELECT * FROM eval_runs WHERE id = ?", [id]);
    return result.rows.length > 0 ? this.hydrateEvalRun(result.rows[0]) : null;
  }

  async listEvalRuns(filters: EvalRunFilters = {}): Promise<EvalRun[]> {
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters.sessionId) {
      conditions.push("session_id = ?");
      params.push(filters.sessionId);
    }

    if (filters.goldenCaseId) {
      conditions.push("golden_case_id = ?");
      params.push(filters.goldenCaseId);
    }

    if (filters.outcome) {
      conditions.push("outcome = ?");
      params.push(filters.outcome);
    }

    if (filters.orgId) {
      conditions.push("org_id = ?");
      params.push(filters.orgId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const sql = `SELECT * FROM eval_runs ${whereClause} ORDER BY run_at DESC LIMIT ${limit} OFFSET ${offset}`;
    const result = await this.db.query(sql, params);
    return result.rows.map((row: any) => this.hydrateEvalRun(row));
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
