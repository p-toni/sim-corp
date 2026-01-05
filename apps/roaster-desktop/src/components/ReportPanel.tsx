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
          {report.trustMetrics ? (
            <div className="panel" style={{ marginTop: "12px", background: "#f8fafc" }}>
              <h4 className="section-title">Trust & Provenance</h4>
              <div className="metrics-grid">
                <div className="field">
                  <strong>Total Points</strong>
                  <span>{report.trustMetrics.totalPoints}</span>
                </div>
                <div className="field">
                  <strong>Verified</strong>
                  <span style={{ color: "#065f46" }}>{report.trustMetrics.verifiedPoints} ({Math.round(report.trustMetrics.verificationRate * 100)}%)</span>
                </div>
                <div className="field">
                  <strong>Unsigned</strong>
                  <span style={{ color: "#92400e" }}>{report.trustMetrics.unsignedPoints}</span>
                </div>
                <div className="field">
                  <strong>Failed</strong>
                  <span style={{ color: "#991b1b" }}>{report.trustMetrics.failedPoints}</span>
                </div>
              </div>
              {report.trustMetrics.deviceIds.length > 0 ? (
                <div className="field" style={{ marginTop: "8px" }}>
                  <strong>Device IDs</strong>
                  <div className="chip-row">
                    {report.trustMetrics.deviceIds.map((kid) => (
                      <span key={kid} className="chip" style={{ fontSize: "11px", fontFamily: "monospace" }}>
                        {kid}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          {report.evaluations && report.evaluations.length > 0 ? (
            <div className="panel" style={{ marginTop: "12px", background: "#f8fafc" }}>
              <h4 className="section-title">Quality Evaluation</h4>
              {report.evaluations.map((evalRun, index) => (
                <div key={evalRun.id} style={{ marginTop: index > 0 ? "12px" : "0", paddingTop: index > 0 ? "12px" : "0", borderTop: index > 0 ? "1px solid #e2e8f0" : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                    <span className={`status status-${evalRun.outcome === "PASS" ? "success" : evalRun.outcome === "WARN" ? "warning" : evalRun.outcome === "FAIL" ? "error" : "neutral"}`}>
                      {evalRun.outcome}
                    </span>
                    {evalRun.goldenCaseId && <span className="muted small-text">vs {evalRun.goldenCaseId.slice(0, 12)}...</span>}
                  </div>
                  {evalRun.detailedMetrics ? (
                    <div className="metrics-grid">
                      {evalRun.detailedMetrics.fcSecondsError !== undefined && (
                        <div className="field">
                          <strong>FC Error</strong>
                          <span>{Math.round(evalRun.detailedMetrics.fcSecondsError)}s</span>
                        </div>
                      )}
                      {evalRun.detailedMetrics.dropSecondsError !== undefined && (
                        <div className="field">
                          <strong>Drop Error</strong>
                          <span>{Math.round(evalRun.detailedMetrics.dropSecondsError)}s</span>
                        </div>
                      )}
                      {evalRun.detailedMetrics.developmentRatioError !== undefined && (
                        <div className="field">
                          <strong>Dev Ratio Error</strong>
                          <span>{(evalRun.detailedMetrics.developmentRatioError * 100).toFixed(1)}%</span>
                        </div>
                      )}
                      {evalRun.detailedMetrics.rorSpikes !== undefined && (
                        <div className="field">
                          <strong>RoR Spikes</strong>
                          <span>{evalRun.detailedMetrics.rorSpikes}</span>
                        </div>
                      )}
                      {evalRun.detailedMetrics.rorCrashes !== undefined && (
                        <div className="field">
                          <strong>RoR Crashes</strong>
                          <span>{evalRun.detailedMetrics.rorCrashes}</span>
                        </div>
                      )}
                    </div>
                  ) : null}
                  {evalRun.passedGates.length > 0 && (
                    <div style={{ marginTop: "8px" }}>
                      <strong className="small-text">Passed:</strong>
                      <div className="chip-row" style={{ marginTop: "4px" }}>
                        {evalRun.passedGates.map((gate) => (
                          <span key={gate} className="chip" style={{ fontSize: "10px", background: "#dcfce7", color: "#166534", borderColor: "#22c55e" }}>
                            {gate.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {evalRun.failedGates.length > 0 && (
                    <div style={{ marginTop: "8px" }}>
                      <strong className="small-text">Failed:</strong>
                      <div className="chip-row" style={{ marginTop: "4px" }}>
                        {evalRun.failedGates.map((gate) => (
                          <span key={gate} className="chip" style={{ fontSize: "10px", background: "#fee2e2", color: "#991b1b", borderColor: "#fca5a5" }}>
                            {gate.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : null}
          <pre className="report-markdown">{report.markdown}</pre>
        </div>
      ) : null}
    </div>
  );
}
