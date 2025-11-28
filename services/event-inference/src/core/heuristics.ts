import type { RoastEvent, TelemetryPoint } from "@sim-corp/schemas";
import type { MachineHeuristicsConfig } from "./config";
import type { SessionState } from "./state";

interface Context {
  session: SessionState;
  config: MachineHeuristicsConfig;
}

export function detectCharge(ctx: Context, point: TelemetryPoint): RoastEvent | null {
  if (ctx.session.emitted.charge) return null;
  return {
    ts: point.ts,
    machineId: point.machineId,
    type: "CHARGE",
    payload: { elapsedSeconds: point.elapsedSeconds ?? 0 }
  };
}

export function detectTurningPoint(ctx: Context): RoastEvent | null {
  if (ctx.session.emitted.tp) return null;
  const telemetry = ctx.session.telemetry;
  if (telemetry.length < 3) return null;
  const latest = telemetry[telemetry.length - 1];
  if ((latest.elapsedSeconds ?? 0) > ctx.config.tpSearchWindowSeconds) {
    return null;
  }
  const prev = telemetry[telemetry.length - 2];
  const prevPrev = telemetry[telemetry.length - 3];

  const btPrevPrev = prevPrev.btC ?? Number.POSITIVE_INFINITY;
  const btPrev = prev.btC ?? Number.POSITIVE_INFINITY;
  const btLatest = latest.btC ?? Number.POSITIVE_INFINITY;

  const isLocalMin = btPrevPrev > btPrev && btPrev < btLatest;
  if (isLocalMin && typeof prev.btC === "number") {
    return {
      ts: prev.ts,
      machineId: prev.machineId,
      type: "TP",
      payload: { elapsedSeconds: prev.elapsedSeconds, btC: prev.btC }
    };
  }

  const slopePrev = (btPrev - btPrevPrev) / Math.max(1, prev.elapsedSeconds ?? 1);
  const slopeLatest = (btLatest - btPrev) / Math.max(1, latest.elapsedSeconds ?? 1);
  if (slopePrev < 0 && slopeLatest >= 0 && typeof prev.btC === "number") {
    return {
      ts: prev.ts,
      machineId: prev.machineId,
      type: "TP",
      payload: { elapsedSeconds: prev.elapsedSeconds, btC: prev.btC }
    };
  }

  return null;
}

export function detectFirstCrack(ctx: Context): RoastEvent | null {
  if (ctx.session.emitted.fc) return null;
  const latest = ctx.session.telemetry[ctx.session.telemetry.length - 1];
  if (!latest) return null;
  const elapsed = latest.elapsedSeconds ?? 0;
  if (elapsed < ctx.config.minFirstCrackSeconds) return null;
  if (typeof latest.btC !== "number") return null;
  if (latest.btC < ctx.config.fcBtThresholdC) return null;
  if (
    typeof ctx.config.fcRorMaxThreshold === "number" &&
    typeof latest.rorCPerMin === "number" &&
    latest.rorCPerMin > ctx.config.fcRorMaxThreshold
  ) {
    return null;
  }
  return {
    ts: latest.ts,
    machineId: latest.machineId,
    type: "FC",
    payload: { elapsedSeconds: elapsed, btC: latest.btC }
  };
}

export function detectDropDueToSilence(
  ctx: Context,
  nowIso: string
): RoastEvent | null {
  if (ctx.session.emitted.drop) return null;
  const lastSeen = Date.parse(ctx.session.lastSeenAtIso);
  const now = Date.parse(nowIso);
  if (Number.isNaN(lastSeen) || Number.isNaN(now)) return null;
  const silenceSeconds = (now - lastSeen) / 1000;
  if (silenceSeconds < ctx.config.dropSilenceSeconds) return null;
  const lastTelemetry = ctx.session.lastTelemetry;
  if (!lastTelemetry) return null;
  return {
    ts: lastTelemetry.ts,
    machineId: lastTelemetry.machineId,
    type: "DROP",
    payload: { elapsedSeconds: lastTelemetry.elapsedSeconds }
  };
}
