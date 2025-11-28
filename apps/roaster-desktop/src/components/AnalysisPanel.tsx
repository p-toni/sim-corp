import type { RoastAnalysis } from "@sim-corp/schemas";

interface AnalysisPanelProps {
  analysis: RoastAnalysis | null;
}

export function AnalysisPanel({ analysis }: AnalysisPanelProps) {
  if (!analysis) {
    return (
      <div className="panel">
        <h2 className="panel-title">Analysis</h2>
        <div className="empty">Load a session to see analysis.</div>
      </div>
    );
  }

  const metrics = [
    ["Total duration", analysis.totalDurationSeconds ? `${analysis.totalDurationSeconds}s` : "—"],
    ["FC", analysis.fcSeconds !== undefined ? `${analysis.fcSeconds}s` : "—"],
    ["Drop", analysis.dropSeconds !== undefined ? `${analysis.dropSeconds}s` : "—"],
    ["Dev ratio", analysis.developmentRatio !== undefined ? analysis.developmentRatio.toFixed(2) : "—"],
    ["Max BT", analysis.maxBtC !== undefined ? `${analysis.maxBtC}°C` : "—"],
    ["End BT", analysis.endBtC !== undefined ? `${analysis.endBtC}°C` : "—"]
  ];

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="panel-title">Analysis</h2>
        <span className="muted small-text">Session {analysis.sessionId}</span>
      </div>
      <div className="details-grid">
        {metrics.map(([label, value]) => (
          <div key={label}>
            <strong>{label}:</strong> {value}
          </div>
        ))}
      </div>

      {analysis.warnings.length ? (
        <div className="warnings">
          <h3>Warnings</h3>
          <ul>
            {analysis.warnings.map((w) => (
              <li key={`${w.code}-${w.message}`} className={`warn-${w.severity.toLowerCase()}`}>
                [{w.severity}] {w.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {analysis.recommendations.length ? (
        <div className="recommendations">
          <h3>Recommendations</h3>
          <ul>
            {analysis.recommendations.map((r) => (
              <li key={`${r.code}-${r.message}`}>
                [{r.confidence}] {r.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
