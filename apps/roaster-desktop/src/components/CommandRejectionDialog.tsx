import { useState } from "react";
import type { CommandProposal } from "@sim-corp/schemas";

export interface CommandRejectionDialogProps {
  command: CommandProposal;
  onReject: (reason: string) => void | Promise<void>;
  onCancel: () => void;
}

// Predefined rejection reason codes
const REJECTION_REASONS = [
  { code: "SAFETY_CONCERN", label: "Safety Concern", description: "Command poses safety risk" },
  { code: "WRONG_TIMING", label: "Wrong Timing", description: "Not the right time for this command" },
  { code: "INCORRECT_TARGET", label: "Incorrect Target", description: "Target value is incorrect" },
  { code: "MACHINE_UNAVAILABLE", label: "Machine Unavailable", description: "Target machine is offline or busy" },
  { code: "SESSION_MISMATCH", label: "Session Mismatch", description: "Command doesn't match current session" },
  { code: "OPERATOR_OVERRIDE", label: "Operator Override", description: "Operator taking manual control" },
  { code: "OTHER", label: "Other", description: "Other reason (specify below)" },
];

/**
 * CommandRejectionDialog
 *
 * Modal dialog for rejecting commands with structured reasons.
 */
export function CommandRejectionDialog({
  command,
  onReject,
  onCancel,
}: CommandRejectionDialogProps) {
  const [selectedReason, setSelectedReason] = useState<string>("");
  const [customReason, setCustomReason] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const handleReject = async (): Promise<void> => {
    if (!selectedReason) {
      return;
    }

    const reasonCode = selectedReason;
    const reasonLabel = REJECTION_REASONS.find((r) => r.code === reasonCode)?.label ?? reasonCode;
    const reasonText =
      selectedReason === "OTHER" && customReason.trim()
        ? customReason.trim()
        : reasonLabel;

    const fullReason = `[${reasonCode}] ${reasonText}`;

    setSubmitting(true);
    try {
      await onReject(fullReason);
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = selectedReason && (selectedReason !== "OTHER" || customReason.trim());

  return (
    <div className="modal-overlay">
      <div className="modal-dialog" style={{ maxWidth: "500px" }}>
        <div className="modal-header">
          <h3 className="modal-title">Reject Command</h3>
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

          {/* Rejection Reason Selection */}
          <div className="panel">
            <h4 className="panel-title">Rejection Reason</h4>
            <label className="form-field">
              <span>Select reason:</span>
              <select
                value={selectedReason}
                onChange={(e) => setSelectedReason(e.target.value)}
                disabled={submitting}
              >
                <option value="">-- Select a reason --</option>
                {REJECTION_REASONS.map((reason) => (
                  <option key={reason.code} value={reason.code}>
                    {reason.label} — {reason.description}
                  </option>
                ))}
              </select>
            </label>

            {selectedReason === "OTHER" && (
              <label className="form-field" style={{ marginTop: "12px" }}>
                <span>Specify reason:</span>
                <textarea
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="Explain why this command is being rejected..."
                  rows={4}
                  disabled={submitting}
                />
              </label>
            )}
          </div>

          {/* Warning */}
          <div className="panel" style={{ backgroundColor: "#fff3cd", padding: "12px" }}>
            <div className="small-text">
              <strong>⚠️ This command will be rejected and will not execute.</strong>
              <p style={{ marginTop: "8px" }}>
                The rejection reason will be recorded in the audit log.
              </p>
            </div>
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
            className="secondary"
            onClick={() => void handleReject()}
            disabled={!canSubmit || submitting}
            style={{ backgroundColor: "#dc3545", color: "white" }}
          >
            {submitting ? "Rejecting..." : "Reject Command"}
          </button>
        </div>
      </div>
    </div>
  );
}
