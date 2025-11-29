import type { GovernanceDecision, Mission } from "@sim-corp/schemas";
import type { ReportGateConfig } from "../config";

interface GateReason {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

const STRONG_MULTIPLIER = 2;

export function evaluateReportMission(
  mission: Mission,
  gate: ReportGateConfig,
  nowIso: string
): GovernanceDecision {
  const signals = mission.signals?.session ?? {};
  const reasons: GateReason[] = [];

  const telemetryPoints = typeof signals.telemetryPoints === "number" ? signals.telemetryPoints : undefined;
  const durationSec = typeof signals.durationSec === "number" ? signals.durationSec : undefined;
  const hasBT = signals.hasBT === true;
  const hasET = signals.hasET === true;

  const missingSignals =
    telemetryPoints === undefined &&
    durationSec === undefined &&
    signals.hasBT === undefined &&
    signals.hasET === undefined &&
    signals.closeReason === undefined;
  if (gate.quarantineOnMissingSignals && missingSignals) {
    reasons.push({
      code: "MISSING_SIGNALS",
      message: "No session quality signals provided",
      details: { subjectId: mission.subjectId }
    });
  }

  if (typeof telemetryPoints === "number" && telemetryPoints < gate.minTelemetryPoints) {
    reasons.push({
      code: "LOW_TELEMETRY_POINTS",
      message: `Telemetry points below threshold (${telemetryPoints} < ${gate.minTelemetryPoints})`,
      details: { telemetryPoints }
    });
  }

  if (typeof durationSec === "number" && durationSec < gate.minDurationSec) {
    reasons.push({
      code: "SHORT_SESSION",
      message: `Session duration too short (${durationSec}s < ${gate.minDurationSec}s)`,
      details: { durationSec }
    });
  }

  if (gate.requireBTorET && !hasBT && !hasET) {
    reasons.push({
      code: "NO_TEMP_CHANNELS",
      message: "No BT/ET telemetry detected",
      details: { hasBT: signals.hasBT, hasET: signals.hasET }
    });
  }

  const strongSession =
    typeof telemetryPoints === "number" &&
    typeof durationSec === "number" &&
    telemetryPoints >= gate.minTelemetryPoints * STRONG_MULTIPLIER &&
    durationSec >= gate.minDurationSec * STRONG_MULTIPLIER;

  if (signals.closeReason === "SILENCE_CLOSE" && gate.quarantineOnSilenceClose && !strongSession) {
    reasons.push({
      code: "SILENCE_CLOSE",
      message: "Session closed due to silence",
      details: { closeReason: signals.closeReason, durationSec, telemetryPoints }
    });
  }

  const action = reasons.length ? "QUARANTINE" : "ALLOW";
  const confidence = computeConfidence({ telemetryPoints, durationSec, hasBT, hasET, reasons, gate });

  return {
    action,
    confidence,
    reasons: reasons.map((reason) => ({
      code: reason.code,
      message: reason.message,
      details: reason.details ?? {}
    })),
    decidedAt: nowIso,
    decidedBy: "KERNEL_GOVERNOR"
  };
}

function computeConfidence(input: {
  telemetryPoints?: number;
  durationSec?: number;
  hasBT: boolean;
  hasET: boolean;
  reasons: GateReason[];
  gate: ReportGateConfig;
}): GovernanceDecision["confidence"] {
  if (input.reasons.length > 0) {
    return "LOW";
  }

  if (
    typeof input.telemetryPoints === "number" &&
    typeof input.durationSec === "number" &&
    input.telemetryPoints >= 300 &&
    input.durationSec >= 360 &&
    input.hasBT
  ) {
    return "HIGH";
  }

  if (
    typeof input.telemetryPoints === "number" &&
    typeof input.durationSec === "number" &&
    input.telemetryPoints >= input.gate.minTelemetryPoints &&
    input.durationSec >= input.gate.minDurationSec &&
    (input.hasBT || input.hasET)
  ) {
    return "MED";
  }

  return "LOW";
}
