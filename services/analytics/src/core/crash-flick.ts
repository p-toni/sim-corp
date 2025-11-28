import type { TelemetryPoint } from "@sim-corp/schemas";
import type { AnalysisConfig } from "./config";

export interface CrashFlickResult {
  crashDetected: boolean;
  flickDetected: boolean;
  crashAtSeconds?: number;
  flickAtSeconds?: number;
  details?: Record<string, unknown>;
}

export function detectCrashFlick(
  telemetry: TelemetryPoint[],
  fcSeconds: number | undefined,
  dropSeconds: number | undefined,
  config: AnalysisConfig
): CrashFlickResult {
  const result: CrashFlickResult = {
    crashDetected: false,
    flickDetected: false,
    details: {}
  };
  if (!telemetry.length) return result;

  const start = fcSeconds ?? telemetry[0].elapsedSeconds ?? 0;
  const end = dropSeconds ?? telemetry[telemetry.length - 1].elapsedSeconds ?? start + config.postFcWindowSeconds;
  const windowPoints = telemetry.filter(
    (p) =>
      typeof p.elapsedSeconds === "number" &&
      p.elapsedSeconds >= start &&
      p.elapsedSeconds <= start + config.postFcWindowSeconds
  );
  const startRor = windowPoints.find((p) => typeof p.rorCPerMin === "number")?.rorCPerMin;
  const minRorPoint = windowPoints.reduce((min, p) => {
    if (typeof p.rorCPerMin !== "number") return min;
    if (!min || p.rorCPerMin < (min.rorCPerMin as number)) return p;
    return min;
  }, undefined as TelemetryPoint | undefined);

  if (startRor !== undefined && minRorPoint?.rorCPerMin !== undefined) {
    const drop = startRor - minRorPoint.rorCPerMin;
    if (drop >= config.crashDropThreshold || minRorPoint.rorCPerMin < config.crashMinRor) {
      result.crashDetected = true;
      result.crashAtSeconds = minRorPoint.elapsedSeconds;
    }
  }

  const tailStart = fcSeconds ? Math.max(fcSeconds, end - (dropSeconds ? dropSeconds * 0.2 : 60)) : end - 60;
  const tailPoints = telemetry.filter(
    (p) =>
      typeof p.elapsedSeconds === "number" &&
      p.elapsedSeconds >= tailStart &&
      p.elapsedSeconds <= end
  );
  if (tailPoints.length >= 2) {
    const minTail = tailPoints.reduce((min, p) => {
      if (typeof p.rorCPerMin !== "number") return min;
      if (!min || p.rorCPerMin < (min.rorCPerMin as number)) return p;
      return min;
    }, undefined as TelemetryPoint | undefined);
    const finalRor = [...tailPoints].reverse().find((p) => typeof p.rorCPerMin === "number")?.rorCPerMin;
    if (minTail?.rorCPerMin !== undefined && finalRor !== undefined) {
      const rise = finalRor - minTail.rorCPerMin;
      if (rise >= config.flickRiseThreshold) {
        result.flickDetected = true;
        result.flickAtSeconds = minTail.elapsedSeconds;
      }
    }
  }

  return result;
}
