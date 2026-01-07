import type { CommandConstraints } from "@sim-corp/schemas";

export interface SafetyInfoPanelProps {
  constraints: CommandConstraints;
  commandType: string;
  targetValue?: number;
  targetUnit?: string;
}

/**
 * SafetyInfoPanel
 *
 * Displays command safety constraints and limits.
 * Used in command approval UX to show operators the safety boundaries.
 */
export function SafetyInfoPanel({
  constraints,
  commandType,
  targetValue,
  targetUnit,
}: SafetyInfoPanelProps) {
  const hasConstraints =
    constraints.minValue !== undefined ||
    constraints.maxValue !== undefined ||
    constraints.rampRate !== undefined ||
    (constraints.requireStates && constraints.requireStates.length > 0) ||
    (constraints.forbiddenStates && constraints.forbiddenStates.length > 0) ||
    constraints.minIntervalSeconds !== undefined ||
    constraints.maxDailyCount !== undefined;

  if (!hasConstraints) {
    return (
      <div className="panel">
        <h4 className="panel-title">Safety Constraints</h4>
        <div className="muted small-text">No constraints configured for {commandType}</div>
      </div>
    );
  }

  // Check if target value is within bounds
  const isWithinBounds =
    targetValue === undefined ||
    ((constraints.minValue === undefined || targetValue >= constraints.minValue) &&
      (constraints.maxValue === undefined || targetValue <= constraints.maxValue));

  return (
    <div className="panel">
      <h4 className="panel-title">Safety Constraints</h4>
      <div className="stack small-text">
        {/* Value Range */}
        {(constraints.minValue !== undefined || constraints.maxValue !== undefined) && (
          <div className="field">
            <span className="muted">Value Range:</span>
            <div className="flex-row">
              <strong>
                {constraints.minValue ?? "−∞"} to {constraints.maxValue ?? "+∞"} {targetUnit ?? ""}
              </strong>
              {!isWithinBounds && (
                <span className="status status-error" style={{ marginLeft: "8px" }}>
                  OUT OF RANGE
                </span>
              )}
            </div>
            {targetValue !== undefined && (
              <div className="muted" style={{ marginTop: "4px" }}>
                Target: {targetValue} {targetUnit ?? ""}
              </div>
            )}
          </div>
        )}

        {/* Ramp Rate */}
        {constraints.rampRate !== undefined && (
          <div className="field">
            <span className="muted">Max Ramp Rate:</span>
            <strong>
              {constraints.rampRate} {targetUnit ?? "units"}/second
            </strong>
          </div>
        )}

        {/* Required States */}
        {constraints.requireStates && constraints.requireStates.length > 0 && (
          <div className="field">
            <span className="muted">Required Roaster States:</span>
            <div className="chip-row" style={{ marginTop: "4px" }}>
              {constraints.requireStates.map((state) => (
                <span key={state} className="chip">
                  {state}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Forbidden States */}
        {constraints.forbiddenStates && constraints.forbiddenStates.length > 0 && (
          <div className="field">
            <span className="muted">Forbidden Roaster States:</span>
            <div className="chip-row" style={{ marginTop: "4px" }}>
              {constraints.forbiddenStates.map((state) => (
                <span key={state} className="chip status-error">
                  {state}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Rate Limits */}
        {(constraints.minIntervalSeconds !== undefined || constraints.maxDailyCount !== undefined) && (
          <div className="field">
            <span className="muted">Rate Limits:</span>
            <ul style={{ marginTop: "4px", paddingLeft: "20px" }}>
              {constraints.minIntervalSeconds !== undefined && (
                <li>
                  Min interval: <strong>{constraints.minIntervalSeconds}s</strong> between commands of this type
                </li>
              )}
              {constraints.maxDailyCount !== undefined && (
                <li>
                  Max daily count: <strong>{constraints.maxDailyCount}</strong> commands per day
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
