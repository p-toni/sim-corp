import type { AgentTraceEntry, RoastEvent } from "@sim-corp/schemas";

interface TraceViewerProps {
  step: AgentTraceEntry | null;
}

function summarizeOutput(output: unknown): string | null {
  if (!output || typeof output !== "object") return null;
  const telemetry = Array.isArray((output as { telemetry?: unknown }).telemetry)
    ? (output as { telemetry: unknown[] }).telemetry
    : [];
  const events = Array.isArray((output as { events?: unknown }).events)
    ? ((output as { events: RoastEvent[] }).events ?? [])
    : [];

  const eventTypes = events
    .map((event) => event?.type)
    .filter((type): type is string => typeof type === "string");

  const parts: string[] = [];
  if (telemetry.length) {
    parts.push(`Telemetry: ${telemetry.length}`);
  }
  if (events.length) {
    parts.push(`Events: ${events.length}${eventTypes.length ? ` (${eventTypes.join(", ")})` : ""}`);
  }

  return parts.length ? parts.join(" · ") : null;
}

export function TraceViewer({ step }: TraceViewerProps) {
  if (!step) {
    return (
      <div className="panel">
        <h2 className="panel-title">Step Details</h2>
        <div className="empty">Select a timeline step to inspect details.</div>
      </div>
    );
  }

  const toolCalls = step.toolCalls ?? [];

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="panel-title">Step Details</h2>
        <span className="muted">
          {step.step} • Iter {step.iteration ?? 0}
        </span>
      </div>
      <div className="details-grid">
        <div>
          <strong>Status:</strong> {step.status}
        </div>
        <div>
          <strong>Started:</strong> {step.startedAt}
        </div>
        <div>
          <strong>Completed:</strong> {step.completedAt ?? "—"}
        </div>
      </div>
      {step.notes ? <p className="notes">Notes: {step.notes}</p> : null}

      <div className="tool-section">
        <h3>Tool Calls</h3>
        {toolCalls.length === 0 ? (
          <div className="empty">No tool calls recorded.</div>
        ) : (
          <ul className="tool-call-list">
            {toolCalls.map((call, idx) => {
              const summary = summarizeOutput(call.output);
              return (
                <li key={`${call.toolName}-${idx}`} className="tool-call">
                  <div className="tool-call-header">
                    <span className="tag">{call.toolName}</span>
                    {call.deniedByPolicy ? <span className="status status-error">Policy Denied</span> : null}
                    {call.error ? <span className="status status-error">Error</span> : null}
                    {typeof call.durationMs === "number" ? (
                      <span className="muted">{call.durationMs.toFixed(1)}ms</span>
                    ) : null}
                  </div>
                  {summary ? <div className="muted">{summary}</div> : null}
                  {call.error ? <div className="error-text">{call.error.message}</div> : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
