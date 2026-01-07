import { useState } from "react";
import type { CommandProposal } from "@sim-corp/schemas";
import { SafetyInfoPanel } from "./SafetyInfoPanel";

export interface CommandApprovalDialogProps {
  command: CommandProposal;
  onApprove: () => void | Promise<void>;
  onCancel: () => void;
}

/**
 * CommandApprovalDialog
 *
 * Modal dialog for approving commands.
 * Requires operator to acknowledge safety information before approving.
 */
export function CommandApprovalDialog({
  command,
  onApprove,
  onCancel,
}: CommandApprovalDialogProps) {
  const [safetyAcknowledged, setSafetyAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleApprove = async (): Promise<void> => {
    if (!safetyAcknowledged) {
      return;
    }

    setSubmitting(true);
    try {
      await onApprove();
    } finally {
      setSubmitting(false);
    }
  };

  // Calculate time remaining until approval timeout
  const timeoutSeconds = command.approvalTimeoutSeconds ?? 300;
  const createdAt = new Date(command.createdAt);
  const deadlineAt = new Date(createdAt.getTime() + timeoutSeconds * 1000);
  const now = new Date();
  const secondsRemaining = Math.max(0, Math.floor((deadlineAt.getTime() - now.getTime()) / 1000));
  const minutesRemaining = Math.floor(secondsRemaining / 60);
  const isUrgent = secondsRemaining < 60;

  return (
    <div className="modal-overlay">
      <div className="modal-dialog" style={{ maxWidth: "600px" }}>
        <div className="modal-header">
          <h3 className="modal-title">Approve Command</h3>
          <button type="button" className="close-button" onClick={onCancel} disabled={submitting}>
            ×
          </button>
        </div>

        <div className="modal-body stack">
          {/* Command Summary */}
          <div className="panel">
            <h4 className="panel-title">Command Details</h4>
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
                <span className="muted">Proposed By:</span>
                <span>
                  {command.proposedBy}
                  {command.agentName ? ` (${command.agentName})` : ""}
                </span>
              </div>
            </div>
          </div>

          {/* Approval Deadline */}
          <div className="panel">
            <h4 className="panel-title">Approval Deadline</h4>
            <div className={`field ${isUrgent ? "status-error" : ""}`}>
              {isUrgent ? (
                <strong>
                  ⚠️ {secondsRemaining} seconds remaining
                </strong>
              ) : (
                <span>
                  {minutesRemaining} minutes remaining ({secondsRemaining % 60}s)
                </span>
              )}
            </div>
          </div>

          {/* Reasoning */}
          <div className="panel">
            <h4 className="panel-title">Reasoning</h4>
            <p className="small-text">{command.reasoning}</p>
          </div>

          {/* Safety Constraints */}
          <SafetyInfoPanel
            constraints={command.command.constraints}
            commandType={command.command.commandType}
            targetValue={command.command.targetValue}
            targetUnit={command.command.targetUnit}
          />

          {/* Safety Acknowledgment */}
          <div className="panel" style={{ backgroundColor: "#fff3cd", padding: "12px" }}>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={safetyAcknowledged}
                onChange={(e) => setSafetyAcknowledged(e.target.checked)}
                disabled={submitting}
              />
              <strong>
                I have reviewed the safety constraints and approve this command for execution.
              </strong>
            </label>
          </div>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="secondary ghost"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => void handleApprove()}
            disabled={!safetyAcknowledged || submitting}
          >
            {submitting ? "Approving..." : "Approve Command"}
          </button>
        </div>
      </div>
    </div>
  );
}
