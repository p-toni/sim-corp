import type { RoastReport } from "@sim-corp/schemas";

interface ReportPanelProps {
  sessionId: string | null;
  report: RoastReport | null;
  loading: boolean;
  error: string | null;
  queuedMessage?: string | null;
  onRefresh: () => Promise<void> | void;
  onGenerate: () => Promise<void> | void;
}

export function ReportPanel({
  sessionId,
  report,
  loading,
  error,
  queuedMessage,
  onRefresh,
  onGenerate
}: ReportPanelProps) {
  if (!sessionId) {
    return <div className="panel muted small-text">Select a session to view its report.</div>;
  }

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
      {loading ? <div className="muted small-text">Loading latest report…</div> : null}
      {!loading && !report ? (
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
