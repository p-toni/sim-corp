import type { RoastEvent, TelemetryPoint } from "@sim-corp/schemas";
import { PhaseBoundarySchema, RoastPhaseSchema, type PhaseBoundary } from "@sim-corp/schemas";
import type { AnalysisConfig } from "./config";

function crossingTime(points: TelemetryPoint[], threshold: number, afterSeconds: number): number | undefined {
  for (const point of points) {
    if (point.elapsedSeconds >= afterSeconds && typeof point.btC === "number" && point.btC >= threshold) {
      return point.elapsedSeconds;
    }
  }
  return undefined;
}

export function derivePhases(args: {
  telemetry: TelemetryPoint[];
  events: RoastEvent[];
  config: AnalysisConfig;
}): {
  chargeSeconds?: number;
  tpSeconds?: number;
  fcSeconds?: number;
  dropSeconds?: number;
  phases: PhaseBoundary[];
  warnings: string[];
} {
  const { telemetry, events, config } = args;
  const chargeEvent = events.find((e) => e.type === "CHARGE");
  const tpEvent = events.find((e) => e.type === "TP");
  const fcEvent = events.find((e) => e.type === "FC");
  const dropEvent = events.find((e) => e.type === "DROP");

  const chargeSeconds = chargeEvent?.payload?.elapsedSeconds ?? telemetry[0]?.elapsedSeconds ?? 0;
  const tpSeconds = tpEvent?.payload?.elapsedSeconds;
  const fcSeconds = fcEvent?.payload?.elapsedSeconds;
  const dropSeconds =
    dropEvent?.payload?.elapsedSeconds ??
    telemetry[telemetry.length - 1]?.elapsedSeconds ??
    (fcSeconds ? fcSeconds + 120 : undefined);

  const warnings: string[] = [];
  const phases: PhaseBoundary[] = [];

  let dryEnd = crossingTime(telemetry, config.dryEndBtC, chargeSeconds);
  if (!dryEnd && typeof tpSeconds === "number") {
    dryEnd = tpSeconds + config.dryingAfterTpSeconds;
  }
  if (!dryEnd && typeof fcSeconds === "number") {
    dryEnd = fcSeconds / 2;
  }

  if (!dryEnd && dropSeconds) {
    dryEnd = dropSeconds * 0.4;
    warnings.push("DRY_END_ESTIMATED");
  }

  if (dryEnd && dryEnd > (fcSeconds ?? dropSeconds ?? dryEnd + 1)) {
    warnings.push("DRY_END_AFTER_FC");
    dryEnd = fcSeconds ?? dropSeconds ?? dryEnd;
  }

  if (dryEnd && dropSeconds && dryEnd < dropSeconds) {
    phases.push(
      PhaseBoundarySchema.parse({
        phase: RoastPhaseSchema.enum.DRYING,
        startSeconds: chargeSeconds,
        endSeconds: dryEnd
      })
    );
  }

  if (dryEnd && (fcSeconds ?? dropSeconds)) {
    const end = fcSeconds ?? dropSeconds!;
    if (dryEnd < end) {
      phases.push(
        PhaseBoundarySchema.parse({
          phase: RoastPhaseSchema.enum.MAILLARD,
          startSeconds: dryEnd,
          endSeconds: end
        })
      );
    }
  }

  if (fcSeconds && dropSeconds && fcSeconds < dropSeconds) {
    phases.push(
      PhaseBoundarySchema.parse({
        phase: RoastPhaseSchema.enum.DEVELOPMENT,
        startSeconds: fcSeconds,
        endSeconds: dropSeconds
      })
    );
  } else if (!fcSeconds) {
    warnings.push("FC_MISSING");
  }

  if (!dropSeconds) {
    warnings.push("DROP_MISSING");
  }

  return {
    chargeSeconds,
    tpSeconds,
    fcSeconds,
    dropSeconds,
    phases,
    warnings
  };
}
