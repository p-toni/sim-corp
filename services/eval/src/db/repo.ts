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
        created_at, created_by, tags_json, archived, metadata_json
      ) VALUES (
        @id, @name, @description, @origin, @processingMethod, @variety, @cropYear,
        @machineId, @batchSizeKg, @chargeTempC,
        @targetFirstCrackSeconds, @targetDropSeconds, @targetDevelopmentPercentage,
        @targetFCTempC, @targetDropTempC, @targetRoastColor,
        @fcSecondsErrorTolerance, @dropSecondsErrorTolerance, @devPercentageErrorTolerance,
        @maxRorSpikes, @maxRorCrashes,
        @sensoryMinScore, @sensoryNotesJson,
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
        tags_json = @tagsJson
      WHERE id = @id
    `);

    stmt.run({
      id,
      name: merged.name,
      description: merged.description ?? null,
      archived: merged.archived ? 1 : 0,
      tagsJson: JSON.stringify(merged.tags ?? [])
    });

    return this.getGoldenCase(id);
  }

  // Eval Runs
  createEvalRun(evalRun: EvalRun): EvalRun {
    const stmt = this.db.prepare(`
      INSERT INTO eval_runs (
        id, session_id, mission_id, golden_case_id, run_at, evaluator_id,
        outcome, passed_gates_json, failed_gates_json,
        detailed_metrics_json, metrics_json, lm_judge_json,
        human_reviewed, human_outcome, human_notes, reviewed_by, reviewed_at,
        org_id, notes, artifacts_json
      ) VALUES (
        @id, @sessionId, @missionId, @goldenCaseId, @runAt, @evaluatorId,
        @outcome, @passedGatesJson, @failedGatesJson,
        @detailedMetricsJson, @metricsJson, @lmJudgeJson,
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
      outcome: evalRun.outcome,
      passedGatesJson: JSON.stringify(evalRun.passedGates ?? []),
      failedGatesJson: JSON.stringify(evalRun.failedGates ?? []),
      detailedMetricsJson: evalRun.detailedMetrics ? JSON.stringify(evalRun.detailedMetrics) : null,
      metricsJson: JSON.stringify(evalRun.metrics ?? []),
      lmJudgeJson: evalRun.lmJudge ? JSON.stringify(evalRun.lmJudge) : null,
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
      outcome: row.outcome as any,
      passedGates: JSON.parse(row.passed_gates_json ?? "[]"),
      failedGates: JSON.parse(row.failed_gates_json ?? "[]"),
      detailedMetrics: row.detailed_metrics_json ? JSON.parse(row.detailed_metrics_json) : undefined,
      metrics: JSON.parse(row.metrics_json ?? "[]"),
      lmJudge: row.lm_judge_json ? JSON.parse(row.lm_judge_json) : undefined,
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
