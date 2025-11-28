import type { TelemetryPoint } from "@sim-corp/schemas";
import type { PhaseBoundary } from "@sim-corp/schemas";

export function computePhaseStats(
  phases: PhaseBoundary[],
  telemetry: TelemetryPoint[]
): Array<{
  phase: PhaseBoundary["phase"];
  durationSeconds: number;
  btDeltaC?: number;
  avgRorCPerMin?: number;
  rorSlopeCPerMin2?: number;
  rorSmoothnessScore?: number;
}> {
  return phases.map((phase) => {
    const points = telemetry.filter(
      (p) =>
        typeof p.elapsedSeconds === "number" &&
        p.elapsedSeconds >= phase.startSeconds &&
        p.elapsedSeconds <= phase.endSeconds
    );
    const durationSeconds = Math.max(0, phase.endSeconds - phase.startSeconds);
    const btDeltaC =
      points.length >= 2 && typeof points[0].btC === "number" && typeof points[points.length - 1].btC === "number"
        ? points[points.length - 1].btC! - points[0].btC!
        : undefined;
    const rors = points.map((p) => p.rorCPerMin).filter((v): v is number => typeof v === "number");
    const avgRorCPerMin = rors.length ? rors.reduce((a, b) => a + b, 0) / rors.length : undefined;
    const rorSlopeCPerMin2 = rors.length >= 2 ? linearSlope(points, rors) : undefined;
    const rorSmoothnessScore = rors.length >= 3 ? smoothness(rors) : undefined;

    return {
      phase: phase.phase,
      durationSeconds,
      btDeltaC,
      avgRorCPerMin,
      rorSlopeCPerMin2,
      rorSmoothnessScore
    };
  });
}

function linearSlope(points: TelemetryPoint[], rors: number[]): number {
  const n = rors.length;
  if (n < 2) return 0;
  const times = points
    .map((p) => p.elapsedSeconds)
    .filter((v): v is number => typeof v === "number")
    .slice(0, rors.length);
  const meanT = times.reduce((a, b) => a + b, 0) / times.length;
  const meanR = rors.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (times[i] - meanT) * (rors[i] - meanR);
    den += Math.pow(times[i] - meanT, 2);
  }
  return den === 0 ? 0 : num / den;
}

function smoothness(rors: number[]): number {
  const diffs: number[] = [];
  for (let i = 1; i < rors.length; i += 1) {
    diffs.push(rors[i] - rors[i - 1]);
  }
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const variance = diffs.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / diffs.length;
  const stddev = Math.sqrt(variance);
  const k = 0.5;
  return 1 / (1 + k * stddev);
}
