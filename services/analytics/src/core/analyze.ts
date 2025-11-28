import {
  EventOverrideSchema,
  SessionMetaSchema,
  RoastAnalysisSchema,
  type RoastAnalysis,
  type RoastEvent,
  type EventOverride,
  type SessionMeta,
  type TelemetryPoint
} from "@sim-corp/schemas";
import { DEFAULT_CONFIG, type AnalysisConfig } from "./config";
import { buildPhasesFromMarkers, deriveMarkers } from "./phases";
import { computePhaseStats } from "./stats";
import { detectCrashFlick } from "./crash-flick";

export function analyzeSession(args: {
  sessionId: string;
  orgId: string;
  siteId: string;
  machineId: string;
  telemetry: TelemetryPoint[];
  events: RoastEvent[];
  overrides?: EventOverride[];
  meta?: SessionMeta | null;
  config?: Partial<AnalysisConfig>;
}): RoastAnalysis {
  const cfg: AnalysisConfig = { ...DEFAULT_CONFIG, ...(args.config ?? {}) };
  const inferredMarkers = deriveMarkers({
    telemetry: args.telemetry,
    events: args.events
  });

  const overrideMap = new Map<string, EventOverride>();
  for (const override of args.overrides ?? []) {
    const parsed = EventOverrideSchema.parse(override);
    overrideMap.set(parsed.eventType, parsed);
  }

  const markers = { ...inferredMarkers };
  const eventTimeSource: Record<string, "INFERRED" | "OVERRIDDEN"> = {};
  const overrideDeltasSeconds: Record<string, number> = {};

  (["CHARGE", "TP", "FC", "DROP"] as const).forEach((type) => {
    const override = overrideMap.get(type);
    const inferredValue = markersForType(inferredMarkers, type);
    if (override) {
      markersForType(markers, type, override.elapsedSeconds);
      eventTimeSource[type] = "OVERRIDDEN";
      if (typeof inferredValue === "number") {
        overrideDeltasSeconds[type] = override.elapsedSeconds - inferredValue;
      }
    } else if (typeof inferredValue === "number") {
      eventTimeSource[type] = "INFERRED";
    }
  });

  const { phases, warnings } = buildPhasesFromMarkers({
    telemetry: args.telemetry,
    markers,
    config: cfg
  });

  const phaseStats = computePhaseStats(phases, args.telemetry);
  const crashFlick = detectCrashFlick(args.telemetry, markers.fcSeconds, markers.dropSeconds, cfg);

  const maxBt = maxBy(args.telemetry, (p) => p.btC ?? -Infinity);
  const endBt = args.telemetry.findLast((p) => typeof p.btC === "number")?.btC;

  const totalDurationSeconds =
    typeof markers.dropSeconds === "number" && typeof markers.chargeSeconds === "number"
      ? markers.dropSeconds - markers.chargeSeconds
      : undefined;
  const developmentRatio =
    typeof markers.fcSeconds === "number" &&
    typeof markers.dropSeconds === "number" &&
    typeof markers.chargeSeconds === "number" &&
    markers.dropSeconds > markers.chargeSeconds
      ? (markers.dropSeconds - markers.fcSeconds) / (markers.dropSeconds - markers.chargeSeconds)
      : undefined;

  const recommendations = buildRecommendations(developmentRatio, crashFlick, phaseStats);
  const overrideWarnings = Object.values(overrideDeltasSeconds).some((delta) => Math.abs(delta) > 30)
    ? [
        {
          code: "LARGE_OVERRIDE_DELTA",
          severity: "INFO" as const,
          message: "Large delta between inferred and overridden event times."
        }
      ]
    : [];
  const analysis: RoastAnalysis = {
    sessionId: args.sessionId,
    orgId: args.orgId,
    siteId: args.siteId,
    machineId: args.machineId,
    computedAt: new Date().toISOString(),
    chargeSeconds: markers.chargeSeconds,
    tpSeconds: markers.tpSeconds,
    fcSeconds: markers.fcSeconds,
    dropSeconds: markers.dropSeconds,
    phases,
    phaseStats,
    totalDurationSeconds,
    developmentRatio,
    maxBtC: maxBt?.btC,
    endBtC: endBt,
    crashFlick,
    eventTimeSource,
    overrideDeltasSeconds,
    meta: args.meta ? SessionMetaSchema.parse(args.meta) : undefined,
    warnings: [
      ...warnings.map((w) => ({
        code: w,
        severity: "WARN" as const,
        message: w
      })),
      ...overrideWarnings
    ],
    recommendations,
    config: cfg as Record<string, unknown>
  };

  return RoastAnalysisSchema.parse(analysis);
}

function markersForType(
  markers: { chargeSeconds?: number; tpSeconds?: number; fcSeconds?: number; dropSeconds?: number },
  type: "CHARGE" | "TP" | "FC" | "DROP",
  next?: number
): number | undefined {
  if (type === "CHARGE") {
    if (typeof next === "number") markers.chargeSeconds = next;
    return markers.chargeSeconds;
  }
  if (type === "TP") {
    if (typeof next === "number") markers.tpSeconds = next;
    return markers.tpSeconds;
  }
  if (type === "FC") {
    if (typeof next === "number") markers.fcSeconds = next;
    return markers.fcSeconds;
  }
  if (type === "DROP") {
    if (typeof next === "number") markers.dropSeconds = next;
    return markers.dropSeconds;
  }
  return undefined;
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
