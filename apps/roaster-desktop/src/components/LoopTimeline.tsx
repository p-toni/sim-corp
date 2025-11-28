import type { AgentTrace } from "@sim-corp/schemas";
import { stepIdForEntry } from "../lib/types";

interface LoopTimelineProps {
  trace: AgentTrace | null;
  selectedStepId: string | null;
  onSelectStep: (id: string) => void;
}

function formatDurationMs(durationMs: number): string {
  if (durationMs >= 1000) {
    return `${(durationMs / 1000).toFixed(1)}s`;
  }
  return `${Math.max(0, Math.round(durationMs))}ms`;
}

export function LoopTimeline({ trace, selectedStepId, onSelectStep }: LoopTimelineProps) {
  if (!trace) {
    return (
      <div className="panel">
        <h2 className="panel-title">Loop Timeline</h2>
        <div className="empty">Run a mission to see the agent loop.</div>
      </div>
    );
  }

  const steps = trace.entries.map((entry, index) => {
    const start = Date.parse(entry.startedAt);
    const end = entry.completedAt ? Date.parse(entry.completedAt) : start;
    const durationMs = Number.isFinite(start) && Number.isFinite(end) ? end - start : 0;
    return {
      id: stepIdForEntry(entry, index),
      entry,
      durationMs
    };
  });

  const iterations =
    trace.metadata &&
    typeof trace.metadata === "object" &&
    "iterations" in trace.metadata &&
    typeof (trace.metadata as Record<string, unknown>).iterations === "number"
      ? (trace.metadata as { iterations?: number }).iterations ?? steps.length
      : steps.length;

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="panel-title">Loop Timeline</h2>
        <span className="muted">Iterations: {iterations}</span>
      </div>
      <div className="timeline">
        {steps.map((step) => (
          <button
            key={step.id}
            type="button"
            className={`timeline-step${selectedStepId === step.id ? " selected" : ""}`}
            onClick={() => onSelectStep(step.id)}
          >
            <div className="timeline-row">
              <span className="tag">{step.entry.step}</span>
              <span className="muted">Iter {step.entry.iteration ?? 0}</span>
              <span className={`status status-${step.entry.status.toLowerCase()}`}>{step.entry.status}</span>
            </div>
            <div className="timeline-row small">
              <span>Duration {formatDurationMs(step.durationMs)}</span>
              {step.entry.notes ? <span className="muted">• {step.entry.notes}</span> : null}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
