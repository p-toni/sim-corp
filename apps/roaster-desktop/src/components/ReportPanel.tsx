import type { RoastReport } from "@sim-corp/schemas";
import type { MissionStatusView } from "../lib/types";

interface ReportPanelProps {
  sessionId: string | null;
  report: RoastReport | null;
  loading: boolean;
  error: string | null;
  queuedMessage?: string | null;
  mission: MissionStatusView | null;
  missionError?: string | null;
  approving?: boolean;
  onRefresh: () => Promise<void> | void;
  onGenerate: () => Promise<void> | void;
  onApprove?: () => Promise<void> | void;
}

export function ReportPanel({
  sessionId,
  report,
  loading,
  error,
  queuedMessage,
  mission,
  missionError,
  approving,
  onRefresh,
  onGenerate,
  onApprove
}: ReportPanelProps) {
  if (!sessionId) {
    return <div className="panel muted small-text">Select a session to view its report.</div>;
  }

  const missionReasons = mission?.governance?.reasons ?? [];
  const missionId = mission?.missionId;

  return (
    <div className="panel">
      <div className="report-header">
        <h3>Report</h3>
        <div className="report-actions">
          <button type="button" className="secondary" onClick={() => onRefresh()} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button type="button" className="primary" onClick={() => onGenerate()}>
            Generate report now
          </button>
        </div>
      </div>
      {queuedMessage ? <div className="muted small-text">{queuedMessage}</div> : null}
      {error ? <div className="error-text">Error: {error}</div> : null}
      {missionError ? <div className="error-text">Mission error: {missionError}</div> : null}
      {loading ? <div className="muted small-text">Loading latest report…</div> : null}
      {mission ? (
        <div className="mission-status">
          <div className="muted small-text">
            Mission {missionId ? `#${missionId}` : ""} status: {mission.status ?? "unknown"}
          </div>
          {mission.nextRetryAt ? <div className="muted small-text">Next retry at {mission.nextRetryAt}</div> : null}
          {missionReasons.length ? (
            <ul className="muted small-text">
              {missionReasons.map((reason) => (
                <li key={`${reason.code}-${reason.message}`}>{reason.message}</li>
              ))}
            </ul>
          ) : null}
          {mission.status === "QUARANTINED" && onApprove ? (
            <button type="button" className="primary" onClick={() => onApprove()} disabled={approving}>
              {approving ? "Approving…" : "Approve & Generate"}
            </button>
          ) : null}
        </div>
      ) : null}
      {!loading && !report && !mission ? (
        <div className="muted small-text">No report yet.</div>
      ) : null}
      {report ? (
        <div className="report-body">
          <div className="muted small-text">Report ID: {report.reportId}</div>
          <pre className="report-markdown">{report.markdown}</pre>
        </div>
      ) : null}
    </div>
  );
}
