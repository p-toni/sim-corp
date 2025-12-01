import type {
  RoastEvent,
  RoastPrediction,
  RoastProfile,
  TelemetryPoint
} from "@sim-corp/schemas";
import { RoastPredictionSchema } from "@sim-corp/schemas";
import { DEFAULT_CONFIG } from "./config";
import { derivePhases } from "./phases";

interface PredictionArgs {
  sessionId: string;
  telemetry: TelemetryPoint[];
  events: RoastEvent[];
  profile?: RoastProfile;
  atTs?: string;
}

interface RegressionResult {
  slope: number;
  intercept: number;
  residual: number;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function linearRegression(points: TelemetryPoint[]): RegressionResult | null {
  const samples = points.filter((p) => typeof p.btC === "number");
  if (samples.length < 2) return null;
  const xs = samples.map((p) => p.elapsedSeconds ?? 0);
  const ys = samples.map((p) => p.btC ?? 0);
  const xMean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const yMean = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i += 1) {
    num += (xs[i] - xMean) * (ys[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;
  const residual = samples.reduce((acc, p) => acc + Math.abs((p.btC ?? 0) - (slope * (p.elapsedSeconds ?? 0) + intercept)), 0);
  return { slope, intercept, residual: residual / samples.length };
}

function rorVolatility(points: TelemetryPoint[]): number {
  const values = points.map((p) => p.rorCPerMin).filter((v): v is number => typeof v === "number");
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function determinePhase(args: {
  telemetry: TelemetryPoint[];
  events: RoastEvent[];
  lastElapsed: number | undefined;
}): RoastPrediction["phase"] {
  const { telemetry, events, lastElapsed } = args;
  const fcEvent = events.find((e) => e.type === "FC");
  const dropEvent = events.find((e) => e.type === "DROP");
  if (dropEvent) return "POST_DROP";
  if (!telemetry.length || typeof lastElapsed !== "number") return "UNKNOWN";
  if (fcEvent) return "DEVELOPMENT";

  const { phases } = derivePhases({ telemetry, events, config: DEFAULT_CONFIG });
  const current = phases.find((p) => lastElapsed >= p.startSeconds && lastElapsed <= p.endSeconds);
  if (current) {
    return current.phase as RoastPrediction["phase"];
  }

  const lastBt = telemetry[telemetry.length - 1]?.btC ?? 0;
  if (lastBt < 80) return "PREHEAT";
  if (lastBt < DEFAULT_CONFIG.dryEndBtC) return "DRYING";
  if (lastBt < 190) return "MAILLARD";
  return "DEVELOPMENT";
}

function featureReasons(reasons: string[], condition: boolean, message: string): void {
  if (condition) reasons.push(message);
}

export function computeRoastPrediction(args: PredictionArgs): RoastPrediction {
  const telemetry = [...args.telemetry]
    .filter((p) => typeof p.elapsedSeconds === "number")
    .sort((a, b) => (a.elapsedSeconds ?? 0) - (b.elapsedSeconds ?? 0));
  const events = [...args.events];
  const lastPoint = telemetry[telemetry.length - 1];
  const lastElapsed = lastPoint?.elapsedSeconds;
  const channelsAvailable = new Set<string>();
  if (telemetry.some((t) => typeof t.btC === "number")) channelsAvailable.add("btC");
  if (telemetry.some((t) => typeof t.rorCPerMin === "number")) channelsAvailable.add("rorCPerMin");
  const pointsUsed = telemetry.length;
  const phase = determinePhase({ telemetry, events, lastElapsed });
  const atTs = args.atTs ?? lastPoint?.ts ?? new Date().toISOString();

  const fcEvent = events.find((e) => e.type === "FC");
  const dropEvent = events.find((e) => e.type === "DROP");
  const fcSeconds = fcEvent?.payload?.elapsedSeconds;
  const dropSeconds = dropEvent?.payload?.elapsedSeconds;

  const windowStart = typeof lastElapsed === "number" ? Math.max(0, lastElapsed - 90) : 0;
  const regressionPoints = telemetry.filter((p) => (p.elapsedSeconds ?? 0) >= windowStart);
  const regression = linearRegression(regressionPoints);
  const slope = regression?.slope ?? 0;
  const intercept = regression?.intercept ?? 0;
  const volatility = rorVolatility(regressionPoints);

  const reasons: string[] = [];
  const profileTargets = args.profile?.targets;

  let fcAt = typeof fcSeconds === "number" ? fcSeconds : undefined;
  if (!fcAt) {
    if (regression && regressionPoints.length >= 3 && slope > 0.01) {
      const targetTemp = profileTargets?.firstCrackTempC ?? 196;
      fcAt = (targetTemp - intercept) / slope;
      featureReasons(reasons, !!profileTargets?.firstCrackTempC, "Using profile first crack target temperature");
    } else if (profileTargets?.targetTimeToFCSeconds) {
      fcAt = profileTargets.targetTimeToFCSeconds;
      featureReasons(reasons, true, "Using profile target time to FC due to limited data");
    }
  }

  let dropAt = typeof dropSeconds === "number" ? dropSeconds : undefined;
  if (!dropAt) {
    if (profileTargets?.targetDropSeconds) {
      dropAt = profileTargets.targetDropSeconds;
      featureReasons(reasons, true, "Anchoring drop to profile target time");
    } else if (profileTargets?.dropTempC && regression && slope > 0.01) {
      dropAt = (profileTargets.dropTempC - intercept) / slope;
      featureReasons(reasons, true, "Projecting drop at profile drop temperature");
    } else if (fcAt && profileTargets?.targetDevRatio && profileTargets.targetDevRatio < 0.99) {
      dropAt = fcAt / (1 - profileTargets.targetDevRatio);
      featureReasons(reasons, true, "Using profile development ratio target");
    }
  }

  const etaToFc = fcAt && typeof lastElapsed === "number" && fcAt > lastElapsed ? fcAt - lastElapsed : undefined;
  const etaToDrop =
    dropAt && typeof lastElapsed === "number" && dropAt > lastElapsed && phase !== "POST_DROP"
      ? dropAt - lastElapsed
      : undefined;

  const dataQuality = clamp(0.5 * Math.min(pointsUsed / 50, 1) + 0.5 * (channelsAvailable.has("btC") ? 1 : 0.4));
  const modelFit = regression ? clamp(1 - Math.min(regression.residual / 25, 1)) : 0.3;
  const phaseFit = phase === "DEVELOPMENT" ? 0.9 : phase === "MAILLARD" ? 0.7 : phase === "DRYING" ? 0.5 : 0.3;
  const profileFit = args.profile
    ? clamp(
        (profileTargets?.targetDropSeconds ? 0.4 : 0.2) +
          (profileTargets?.targetDevRatio ? 0.3 : 0) +
          (profileTargets?.firstCrackTempC ? 0.3 : 0)
      )
    : undefined;
  const confidenceParts = [dataQuality, modelFit, phaseFit, ...(profileFit !== undefined ? [profileFit] : [])];
  const overall = confidenceParts.reduce((a, b) => a + b, 0) / confidenceParts.length;

  featureReasons(reasons, !channelsAvailable.has("btC"), "BT channel missing; predictions limited");
  featureReasons(reasons, pointsUsed < 12, "Limited recent telemetry; confidence reduced");
  featureReasons(reasons, volatility > 2, "High RoR volatility detected");
  featureReasons(reasons, slope <= 0.01, "BT slope too flat for confident projection");

  const suggestions: RoastPrediction["suggestions"] = [];
  if (profileTargets?.targetDropSeconds && dropAt) {
    const delta = dropAt - profileTargets.targetDropSeconds;
    if (Math.abs(delta) > 10) {
      suggestions.push({
        kind: "TIMING",
        title: delta > 0 ? "Trending late vs target" : "Trending early vs target",
        detail: `Projected drop is ${Math.round(Math.abs(delta))}s ${delta > 0 ? "after" : "before"} target drop time`,
        severity: "WARN",
        requiresApproval: false
      });
    }
  }

  if (volatility > 2) {
    suggestions.push({
      kind: "STABILITY",
      title: "RoR is unstable",
      detail: "Rate of rise volatility is high; consider smoother adjustments to stabilize the curve",
      severity: "INFO",
      requiresApproval: false
    });
  }

  const predictedDevRatio =
    fcAt && dropAt && dropAt > 0 && fcAt < dropAt ? (dropAt - fcAt) / dropAt : undefined;
  if (predictedDevRatio && profileTargets?.targetDevRatio) {
    const delta = predictedDevRatio - profileTargets.targetDevRatio;
    if (Math.abs(delta) > 0.03) {
      suggestions.push({
        kind: "DEVELOPMENT",
        title: delta > 0 ? "Development trending long" : "Development trending short",
        detail: `Predicted development ratio is ${(predictedDevRatio * 100).toFixed(1)}% vs target ${(profileTargets.targetDevRatio * 100).toFixed(1)}%`,
        severity: "INFO",
        requiresApproval: false
      });
    }
  }

  const prediction: RoastPrediction = RoastPredictionSchema.parse({
    sessionId: args.sessionId,
    atTs,
    phase,
    inputs: {
      pointsUsed,
      channelsAvailable: Array.from(channelsAvailable),
      profileId: args.profile?.profileId,
      profileVersion: args.profile?.version
    },
    etaSeconds: {
      toFC: phase === "POST_DROP" ? undefined : etaToFc,
      toDrop: phase === "POST_DROP" ? undefined : etaToDrop
    },
    predictedTimes: {
      fcAtElapsedSeconds: fcAt,
      dropAtElapsedSeconds: dropAt
    },
    predictedDevRatio,
    confidence: {
      overall: clamp(overall),
      components: {
        dataQuality,
        modelFit,
        phaseFit,
        profileFit
      },
      reasons
    },
    suggestions,
    explain: {
      method: "HEURISTIC_V1",
      features: {
        slope,
        intercept,
        volatility,
        regressionPoints: regressionPoints.length,
        hasProfile: Boolean(args.profile)
      },
      lastObserved: {
        elapsedSeconds: lastElapsed ?? 0,
        btC: lastPoint?.btC,
        rorCPerMin: lastPoint?.rorCPerMin
      }
    }
  });

  return prediction;
}
