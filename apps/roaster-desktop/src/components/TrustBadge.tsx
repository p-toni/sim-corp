import type { VerificationResult } from "@sim-corp/schemas";

interface TrustBadgeProps {
  verification: VerificationResult | null | undefined;
  kid?: string;
}

export function TrustBadge({ verification, kid }: TrustBadgeProps) {
  if (!verification) {
    return (
      <span className="trust-badge unsigned" title="Unsigned telemetry">
        <span className="badge-icon">⚠</span>
        <span className="badge-label">Unsigned</span>
      </span>
    );
  }

  if (verification.verified) {
    return (
      <span className="trust-badge verified" title={`Verified: ${kid || "unknown device"}`}>
        <span className="badge-icon">✓</span>
        <span className="badge-label">Verified</span>
        {kid && <span className="badge-kid">{kid}</span>}
      </span>
    );
  }

  const errorMsg = verification.error || "Signature verification failed";
  return (
    <span className="trust-badge failed" title={errorMsg}>
      <span className="badge-icon">✗</span>
      <span className="badge-label">Unverified</span>
      {verification.error && <span className="badge-error">{verification.error}</span>}
    </span>
  );
}
