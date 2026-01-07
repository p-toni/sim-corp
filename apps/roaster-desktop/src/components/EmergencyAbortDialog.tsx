import { useState } from "react";
import type { CommandProposal } from "@sim-corp/schemas";

export interface EmergencyAbortDialogProps {
  command: CommandProposal;
  onAbort: () => void | Promise<void>;
  onCancel: () => void;
}

/**
 * EmergencyAbortDialog
 *
 * Modal dialog for emergency abort of executing commands.
 * Requires operator confirmation before aborting.
 */
export function EmergencyAbortDialog({
  command,
  onAbort,
  onCancel,
}: EmergencyAbortDialogProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleAbort = async (): Promise<void> => {
    if (!confirmed) {
      return;
    }

    setSubmitting(true);
    try {
      await onAbort();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-dialog" style={{ maxWidth: "500px" }}>
        <div className="modal-header" style={{ borderLeft: "4px solid #dc3545" }}>
          <h3 className="modal-title" style={{ color: "#dc3545" }}>
            Emergency Abort
          </h3>
          <button type="button" className="close-button" onClick={onCancel} disabled={submitting}>
            ×
          </button>
        </div>

        <div className="modal-body stack">
          {/* Warning Banner */}
          <div
            className="panel"
            style={{
              backgroundColor: "#f8d7da",
              border: "1px solid #dc3545",
              padding: "16px",
            }}
          >
            <strong style={{ color: "#721c24" }}>
              ⚠️ This will immediately attempt to abort the executing command.
            </strong>
            <p className="small-text" style={{ color: "#721c24", marginTop: "8px" }}>
              The system will attempt to return the roaster to a safe state. If abort fails, you
              will be alerted to take manual intervention.
            </p>
          </div>

          {/* Command Summary */}
          <div className="panel">
            <h4 className="panel-title">Command Being Aborted</h4>
            <div className="grid two-col small-text">
              <div className="field">
                <span className="muted">Type:</span>
                <strong>{command.command.commandType}</strong>
              </div>
              <div className="field">
                <span className="muted">Machine:</span>
                <span>{command.command.machineId}</span>
              </div>
              <div className="field">
                <span className="muted">Target:</span>
                <strong>
                  {command.command.targetValue ?? "−"} {command.command.targetUnit ?? ""}
                </strong>
              </div>
              <div className="field">
                <span className="muted">Status:</span>
                <span className="status status-warning">{command.status}</span>
              </div>
            </div>
          </div>

          {/* Confirmation */}
          <div
            className="panel"
            style={{
              backgroundColor: "#fff3cd",
              border: "1px solid #856404",
              padding: "12px",
            }}
          >
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                disabled={submitting}
              />
              <strong style={{ color: "#856404" }}>
                I confirm this emergency abort and understand the risks.
              </strong>
            </label>
          </div>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="secondary"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            style={{
              backgroundColor: confirmed ? "#dc3545" : "#ccc",
              borderColor: confirmed ? "#dc3545" : "#ccc",
            }}
            onClick={() => void handleAbort()}
            disabled={!confirmed || submitting}
          >
            {submitting ? "Aborting..." : "Emergency Abort"}
          </button>
        </div>
      </div>
    </div>
  );
}
