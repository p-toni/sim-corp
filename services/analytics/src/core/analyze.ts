import {
  RoastAnalysisSchema,
  type RoastAnalysis,
  type RoastEvent,
  type TelemetryPoint
} from "@sim-corp/schemas";
import { DEFAULT_CONFIG, type AnalysisConfig } from "./config";
import { derivePhases } from "./phases";
import { computePhaseStats } from "./stats";
import { detectCrashFlick } from "./crash-flick";

export function analyzeSession(args: {
  sessionId: string;
  orgId: string;
  siteId: string;
  machineId: string;
  telemetry: TelemetryPoint[];
  events: RoastEvent[];
  config?: Partial<AnalysisConfig>;
}): RoastAnalysis {
  const cfg: AnalysisConfig = { ...DEFAULT_CONFIG, ...(args.config ?? {}) };
  const { chargeSeconds, tpSeconds, fcSeconds, dropSeconds, phases, warnings } = derivePhases({
    telemetry: args.telemetry,
    events: args.events,
    config: cfg
  });

  const phaseStats = computePhaseStats(phases, args.telemetry);
  const crashFlick = detectCrashFlick(args.telemetry, fcSeconds, dropSeconds, cfg);

  const maxBt = maxBy(args.telemetry, (p) => p.btC ?? -Infinity);
  const endBt = args.telemetry.findLast((p) => typeof p.btC === "number")?.btC;

  const totalDurationSeconds =
    typeof dropSeconds === "number" && typeof chargeSeconds === "number"
      ? dropSeconds - chargeSeconds
      : undefined;
  const developmentRatio =
    typeof fcSeconds === "number" &&
    typeof dropSeconds === "number" &&
    typeof chargeSeconds === "number" &&
    dropSeconds > chargeSeconds
      ? (dropSeconds - fcSeconds) / (dropSeconds - chargeSeconds)
      : undefined;

  const recommendations = buildRecommendations(developmentRatio, crashFlick, phaseStats);
  const analysis: RoastAnalysis = {
    sessionId: args.sessionId,
    orgId: args.orgId,
    siteId: args.siteId,
    machineId: args.machineId,
    computedAt: new Date().toISOString(),
    chargeSeconds,
    tpSeconds,
    fcSeconds,
    dropSeconds,
    phases,
    phaseStats,
    totalDurationSeconds,
    developmentRatio,
    maxBtC: maxBt?.btC,
    endBtC: endBt,
    crashFlick,
    warnings: warnings.map((w) => ({
      code: w,
      severity: "WARN",
      message: w
    })),
    recommendations,
    config: cfg as Record<string, unknown>
  };

  return RoastAnalysisSchema.parse(analysis);
}

function maxBy<T>(items: T[], fn: (item: T) => number): T | undefined {
  return items.reduce((max, item) => {
    if (!max || fn(item) > fn(max)) return item;
    return max;
  }, undefined as T | undefined);
}

function buildRecommendations(
  developmentRatio: number | undefined,
  crashFlick: { crashDetected: boolean; flickDetected: boolean },
  phaseStats: Array<{ rorSmoothnessScore?: number }>
) {
  const recs: Array<{ code: string; message: string; confidence: "LOW" | "MED" | "HIGH" }> = [];
  if (developmentRatio !== undefined) {
    if (developmentRatio < 0.16) {
      recs.push({
        code: "INCREASE_DEV_TIME",
        message: "Development ratio low; consider extending post-FC time or delaying drop.",
        confidence: "MED"
      });
    } else if (developmentRatio > 0.28) {
      recs.push({
        code: "REDUCE_DEV_TIME",
        message: "Development ratio high; consider earlier drop or earlier FC.",
        confidence: "MED"
      });
    }
  }

  if (crashFlick.crashDetected) {
    recs.push({
      code: "AVOID_ROR_CRASH",
      message: "RoR crash detected after FC; smooth heat reductions.",
      confidence: "HIGH"
    });
  }
  if (crashFlick.flickDetected) {
    recs.push({
      code: "AVOID_ROR_FLICK",
      message: "RoR flick detected near end; avoid late heat increases.",
      confidence: "MED"
    });
  }

  if (phaseStats.some((p) => (p.rorSmoothnessScore ?? 1) < 0.4)) {
    recs.push({
      code: "IMPROVE_STABILITY",
      message: "RoR oscillation detected; stabilize control or airflow.",
      confidence: "LOW"
    });
  }
  return recs;
}
