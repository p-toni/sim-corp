export interface VerificationSummary {
  verified: boolean;
  reason?: string;
  kid?: string;
}

interface VerificationBadgeProps {
  summary?: VerificationSummary | null;
}

export function VerificationBadge({ summary }: VerificationBadgeProps) {
  const verified = summary?.verified === true;
  const reason = verified ? undefined : summary?.reason ?? "UNKNOWN";
  const parts = [];
  if (reason) {
    parts.push(`Reason: ${reason}`);
  }
  if (summary?.kid) {
    parts.push(`KID: ${summary.kid}`);
  }
  const title = parts.length ? parts.join(" • ") : undefined;
  return (
    <span className={`status verification-badge ${verified ? "status-success" : "status-error"}`} title={title}>
      {verified ? "Verified" : "Unverified"}
    </span>
  );
}
