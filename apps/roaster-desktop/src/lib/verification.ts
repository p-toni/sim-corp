import type { RoastEventRecord, TelemetryEnvelope, TelemetryRecord } from "@sim-corp/schemas";
import type { VerificationSummary } from "../components/VerificationBadge";

export function summaryFromEnvelope(envelope: TelemetryEnvelope): VerificationSummary | null {
  if (!envelope) return null;
  if (!envelope.verification) {
    return { verified: false, reason: "MISSING_VERIFICATION", kid: envelope.kid };
  }
  return {
    verified: envelope.verification.verified,
    reason: envelope.verification.reason,
    kid: envelope.kid
  };
}

export function summarizeVerification(
  telemetry: TelemetryRecord[],
  events: RoastEventRecord[]
): VerificationSummary | null {
  const latestTelemetry = telemetry[telemetry.length - 1];
  const latestEvent = events[events.length - 1];
  const candidates = [latestTelemetry, latestEvent].filter(Boolean) as Array<{
    ts: string;
    verification?: { verified: boolean; reason?: string };
    kid?: string;
  }>;
  if (!candidates.length) return null;
  const latest = candidates.sort((a, b) => b.ts.localeCompare(a.ts))[0];
  if (!latest.verification) {
    return { verified: false, reason: "MISSING_VERIFICATION", kid: latest.kid };
  }
  return {
    verified: latest.verification.verified,
    reason: latest.verification.reason,
    kid: latest.kid
  };
}
