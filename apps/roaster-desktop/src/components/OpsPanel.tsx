import { useEffect, useMemo, useState } from "react";
import type { KernelMissionRecord, MissionListFilters } from "../lib/api";
import { approveMission, cancelMission, getGovernorConfig, listMissions, retryNowMission } from "../lib/api";
import type { CommandProposal, CommandSummary } from "@sim-corp/schemas";
import {
  listCommands,
  getCommandSummary,
  approveCommand as approveCommandAPI,
  rejectCommand as rejectCommandAPI,
  abortCommand as abortCommandAPI,
  type CommandListFilters,
} from "../lib/command-api";
import { SafetyInfoPanel } from "./SafetyInfoPanel";
import { CommandApprovalDialog } from "./CommandApprovalDialog";
import { CommandRejectionDialog } from "./CommandRejectionDialog";
import { EmergencyAbortDialog } from "./EmergencyAbortDialog";

const NEEDS_ATTENTION: Array<KernelMissionRecord["status"]> = ["QUARANTINED", "RETRY", "BLOCKED"];
const ALL_STATUSES: Array<KernelMissionRecord["status"]> = [
  "PENDING",
  "RUNNING",
  "QUARANTINED",
  "RETRY",
  "BLOCKED",
  "DONE",
  "FAILED",
  "CANCELED"
];

interface OpsPanelProps {
  pollIntervalMs?: number;
}

type OpsTab = "missions" | "commands";

function formatDate(value?: string): string {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function statusBadge(status: KernelMissionRecord["status"]): string {
  if (status === "QUARANTINED" || status === "BLOCKED") return "status-error";
  if (status === "RETRY") return "status-warning";
  if (status === "DONE") return "status-success";
  return "status-neutral";
}

function matchesText(value: string | undefined, query: string): boolean {
  if (!query) return true;
  return (value ?? "").toLowerCase().includes(query.toLowerCase());
}

export function OpsPanel({ pollIntervalMs = 8000 }: OpsPanelProps) {
  const [activeTab, setActiveTab] = useState<OpsTab>("missions");

  // Mission state
  const [missions, setMissions] = useState<KernelMissionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<MissionListFilters>({ status: NEEDS_ATTENTION });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [config, setConfig] = useState<unknown | null>(null);
  const [showConfig, setShowConfig] = useState(false);

  // Command state
  const [commands, setCommands] = useState<CommandProposal[]>([]);
  const [commandsLoading, setCommandsLoading] = useState(false);
  const [commandFilters, setCommandFilters] = useState<CommandListFilters>({});
  const [selectedCommandId, setSelectedCommandId] = useState<string | null>(null);
  const [commandSummary, setCommandSummary] = useState<CommandSummary | null>(null);

  // Command approval dialog state
  const [approvalDialogCommand, setApprovalDialogCommand] = useState<CommandProposal | null>(null);
  const [rejectionDialogCommand, setRejectionDialogCommand] = useState<CommandProposal | null>(null);
  const [abortDialogCommand, setAbortDialogCommand] = useState<CommandProposal | null>(null);

  const selectedMission = useMemo(
    () => missions.find((m) => m.missionId === selectedId || m.id === selectedId) ?? null,
    [missions, selectedId]
  );

  const selectedCommand = useMemo(
    () => commands.find((c) => c.proposalId === selectedCommandId) ?? null,
    [commands, selectedCommandId]
  );

  const goalOptions = useMemo(() => {
    const values = new Set<string>();
    missions.forEach((m) => {
      const goalTitle = typeof m.goal === "string" ? m.goal : (m.goal as { title?: string })?.title;
      if (goalTitle) values.add(goalTitle);
    });
    return Array.from(values);
  }, [missions]);

  const handleRefresh = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const list = await listMissions(filters);
      setMissions(list.items);
      if (!selectedId && list.items.length) {
        setSelectedId(list.items[0]?.missionId ?? list.items[0]?.id ?? null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load missions";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void handleRefresh();
  }, [filters]);

  useEffect(() => {
    const timer = setInterval(() => {
      void handleRefresh();
    }, pollIntervalMs);
    return () => clearInterval(timer);
  }, [pollIntervalMs, filters]);

  useEffect(() => {
    if (!showConfig) return;
    void (async () => {
      try {
        const cfg = await getGovernorConfig();
        setConfig(cfg);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load config";
        setError(message);
      }
    })();
  }, [showConfig]);

  const toggleStatus = (status: KernelMissionRecord["status"]): void => {
    setFilters((prev) => {
      const current = Array.isArray(prev.status) ? prev.status : prev.status ? [prev.status] : [];
      const next = current.includes(status) ? current.filter((s) => s !== status) : [...current, status];
      return { ...prev, status: next.length ? next : undefined };
    });
  };

  const applyNeedsAttention = (enabled: boolean): void => {
    setFilters((prev) => ({
      ...prev,
      status: enabled ? NEEDS_ATTENTION : undefined
    }));
  };

  const handleAction = async (
    action: "approve" | "cancel" | "retry",
    mission: KernelMissionRecord
  ): Promise<void> => {
    setError(null);
    try {
      if (action === "approve") {
        await approveMission(mission.missionId ?? mission.id ?? "");
      } else if (action === "cancel") {
        await cancelMission(mission.missionId ?? mission.id ?? "");
      } else if (action === "retry") {
        await retryNowMission(mission.missionId ?? mission.id ?? "");
      }
      await handleRefresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Action failed";
      setError(message);
    }
  };

  const filteredMissions = useMemo(() => {
    return missions.filter((m) => {
      const subjectMatches = matchesText(m.subjectId, filters.subjectId ?? "");
      const machineMatches = matchesText(m.context?.machineId as string | undefined, filters.machineId ?? "");
      const goalTitle = typeof m.goal === "string" ? m.goal : (m.goal as { title?: string })?.title;
      const goalMatches = !filters.goal || goalTitle === filters.goal;
      return subjectMatches && machineMatches && goalMatches;
    });
  }, [missions, filters]);

  const handleRefreshCommands = async (): Promise<void> => {
    setCommandsLoading(true);
    setError(null);
    try {
      const [list, summary] = await Promise.all([
        listCommands(commandFilters),
        getCommandSummary(),
      ]);
      setCommands(list.items);
      setCommandSummary(summary);
      if (!selectedCommandId && list.items.length) {
        setSelectedCommandId(list.items[0]?.proposalId ?? null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load commands";
      setError(message);
    } finally {
      setCommandsLoading(false);
    }
  };

  const handleApproveCommand = async (): Promise<void> => {
    if (!approvalDialogCommand) return;

    setError(null);
    try {
      const actor = {
        kind: "USER" as const,
        id: "desktop-user",
        display: "Desktop Operator",
      };

      await approveCommandAPI(approvalDialogCommand.proposalId, actor);
      setApprovalDialogCommand(null);
      await handleRefreshCommands();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Action failed";
      setError(message);
    }
  };

  const handleRejectCommand = async (reason: string): Promise<void> => {
    if (!rejectionDialogCommand) return;

    setError(null);
    try {
      const actor = {
        kind: "USER" as const,
        id: "desktop-user",
        display: "Desktop Operator",
      };

      await rejectCommandAPI(rejectionDialogCommand.proposalId, actor, reason);
      setRejectionDialogCommand(null);
      await handleRefreshCommands();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Action failed";
      setError(message);
    }
  };

  const handleAbortCommand = async (): Promise<void> => {
    if (!abortDialogCommand) return;

    setError(null);
    try {
      const result = await abortCommandAPI(abortDialogCommand.proposalId);

      setAbortDialogCommand(null);

      // Check if abort failed and show critical alert
      if (result.status === "FAILED") {
        setError(
          `🚨 ABORT FAILED: ${result.message ?? "Unknown error"}. Manual intervention required for machine ${abortDialogCommand.command.machineId}.`
        );
        // Still refresh to show updated status, but error remains visible
        setCommandsLoading(true);
        try {
          const [list, summary] = await Promise.all([
            listCommands(commandFilters),
            getCommandSummary(),
          ]);
          setCommands(list.items);
          setCommandSummary(summary);
        } finally {
          setCommandsLoading(false);
        }
      } else {
        // Success - do normal refresh which clears errors
        await handleRefreshCommands();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Abort failed";
      setAbortDialogCommand(null);
      setError(`🚨 ABORT ERROR: ${message}. Manual intervention may be required.`);
    }
  };

  useEffect(() => {
    if (activeTab === "commands") {
      void handleRefreshCommands();
    }
  }, [activeTab, commandFilters]);

  useEffect(() => {
    if (activeTab === "commands") {
      const timer = setInterval(() => {
        void handleRefreshCommands();
      }, pollIntervalMs);
      return () => clearInterval(timer);
    }
  }, [pollIntervalMs, activeTab, commandFilters]);

  return (
    <div className="panel stack">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Operations</h2>
          <div className="muted small-text">Missions, commands, and governance</div>
        </div>
        <div className="live-actions">
          {activeTab === "missions" ? (
            <>
              <button type="button" className="secondary" onClick={() => void handleRefresh()} disabled={loading}>
                Refresh
              </button>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={Array.isArray(filters.status) && filters.status.length === NEEDS_ATTENTION.length &&
                    NEEDS_ATTENTION.every((s) => (filters.status as string[]).includes(s))}
                  onChange={(event) => applyNeedsAttention(event.target.checked)}
                />
                <span>Needs attention</span>
              </label>
              <button type="button" className="secondary ghost" onClick={() => setShowConfig((prev) => !prev)}>
                Governor config
              </button>
            </>
          ) : (
            <button type="button" className="secondary" onClick={() => void handleRefreshCommands()} disabled={commandsLoading}>
              Refresh
            </button>
          )}
        </div>
      </div>

      <div className="chip-row">
        <button
          type="button"
          className={`chip ${activeTab === "missions" ? "active" : ""}`}
          onClick={() => setActiveTab("missions")}
        >
          Missions
        </button>
        <button
          type="button"
          className={`chip ${activeTab === "commands" ? "active" : ""}`}
          onClick={() => setActiveTab("commands")}
        >
          Commands
        </button>
      </div>

      {activeTab === "missions" ? (
        <div className="ops-grid">
          <div className="ops-list">
            <div className="ops-filters">
            <div className="filter-group">
              <label className="small-text">Status</label>
              <div className="chip-row">
                {ALL_STATUSES.map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={`chip ${Array.isArray(filters.status) && filters.status.includes(status) ? "active" : ""}`}
                    onClick={() => toggleStatus(status)}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
            <div className="filter-grid">
              <label className="form-field">
                <span>Goal</span>
                <select
                  value={filters.goal ?? ""}
                  onChange={(event) => setFilters((prev) => ({ ...prev, goal: event.target.value || undefined }))}
                >
                  <option value="">Any</option>
                  {goalOptions.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>Machine</span>
                <input
                  type="text"
                  placeholder="machine id"
                  value={filters.machineId ?? ""}
                  onChange={(event) => setFilters((prev) => ({ ...prev, machineId: event.target.value || undefined }))}
                />
              </label>
              <label className="form-field">
                <span>Subject / Session</span>
                <input
                  type="text"
                  placeholder="subject id"
                  value={filters.subjectId ?? ""}
                  onChange={(event) => setFilters((prev) => ({ ...prev, subjectId: event.target.value || undefined }))}
                />
              </label>
            </div>
          </div>
          <div className="ops-table" role="table">
            <div className="ops-row header" role="row">
              <div>Created</div>
              <div>Status</div>
              <div>Goal</div>
              <div>Subject</div>
              <div>Machine</div>
              <div>Attempts</div>
              <div>Next retry</div>
            </div>
            {filteredMissions.length === 0 ? (
              <div className="empty">No missions match filters</div>
            ) : (
              filteredMissions.map((mission) => {
                const goalTitle = typeof mission.goal === "string" ? mission.goal : (mission.goal as { title?: string })?.title;
                return (
                  <button
                    type="button"
                    key={mission.missionId ?? mission.id}
                    className={`ops-row ${selectedMission?.missionId === mission.missionId || selectedMission?.id === mission.id ? "selected" : ""}`}
                    onClick={() => setSelectedId(mission.missionId ?? mission.id ?? null)}
                  >
                    <div>{formatDate(mission.createdAt)}</div>
                    <div>
                      <span className={`status ${statusBadge(mission.status)}`}>{mission.status}</span>
                    </div>
                    <div>{goalTitle}</div>
                    <div>{mission.subjectId ?? "-"}</div>
                    <div>{(mission.context as { machineId?: string })?.machineId ?? "-"}</div>
                    <div>
                      {mission.attempts ?? 0}/{mission.maxAttempts ?? 0}
                    </div>
                    <div>{mission.status === "RETRY" ? formatDate(mission.nextRetryAt) : "-"}</div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="ops-detail">
          {selectedMission ? (
            <div className="stack">
              <div className="panel-header">
                <h3 className="panel-title">Mission {selectedMission.missionId ?? selectedMission.id}</h3>
                <div className="ops-actions">
                  {selectedMission.status === "QUARANTINED" ? (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => void handleAction("approve", selectedMission)}
                    >
                      Approve
                    </button>
                  ) : null}
                  {selectedMission.status === "RETRY" ? (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => void handleAction("retry", selectedMission)}
                    >
                      Retry now
                    </button>
                  ) : null}
                  {selectedMission.status !== "DONE" ? (
                    <button
                      type="button"
                      className="secondary ghost"
                      onClick={() => void handleAction("cancel", selectedMission)}
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="muted small-text">Updated {formatDate(selectedMission.updatedAt)}</div>
              <div className="grid two-col">
                <div className="field">
                  <span className="small-text">Status</span>
                  <strong>{selectedMission.status}</strong>
                </div>
                <div className="field">
                  <span className="small-text">Goal</span>
                  <span>{typeof selectedMission.goal === "string" ? selectedMission.goal : (selectedMission.goal as { title?: string })?.title}</span>
                </div>
                <div className="field">
                  <span className="small-text">Subject</span>
                  <span>{selectedMission.subjectId ?? "-"}</span>
                </div>
                <div className="field">
                  <span className="small-text">Context</span>
                  <span>{JSON.stringify(selectedMission.context ?? {})}</span>
                </div>
              </div>

              <div className="panel">
                <h4 className="panel-title">Governance</h4>
                {selectedMission.governance ? (
                  <div className="stack small-text">
                    <div>Action: {selectedMission.governance.action}</div>
                    <div>Confidence: {selectedMission.governance.confidence}</div>
                    <div>Reasons:</div>
                    <ul>
                      {selectedMission.governance.reasons?.map((reason, idx) => (
                        <li key={idx}>
                          <strong>{reason.code ?? "UNKNOWN"}</strong>: {reason.message ?? ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="muted">No governance decision recorded</div>
                )}
              </div>

              <div className="panel">
                <h4 className="panel-title">Signals</h4>
                {selectedMission.signals ? (
                  <pre className="code-block">{JSON.stringify(selectedMission.signals, null, 2)}</pre>
                ) : (
                  <div className="muted">No signals captured</div>
                )}
              </div>

              <div className="panel">
                <h4 className="panel-title">Execution</h4>
                <div className="grid two-col small-text">
                  <div>Attempts: {selectedMission.attempts ?? 0}</div>
                  <div>Max attempts: {selectedMission.maxAttempts ?? 0}</div>
                  <div>Lease: {selectedMission.leaseId ?? "-"}</div>
                  <div>Claimed by: {selectedMission.claimedBy ?? "-"}</div>
                  <div>Last error: {selectedMission.lastError ? JSON.stringify(selectedMission.lastError) : "-"}</div>
                </div>
              </div>

              <div className="panel">
                <h4 className="panel-title">Result</h4>
                {selectedMission.resultMeta ? (
                  <pre className="code-block">{JSON.stringify(selectedMission.resultMeta, null, 2)}</pre>
                ) : (
                  <div className="muted">No result yet</div>
                )}
              </div>
            </div>
          ) : (
            <div className="empty">Select a mission to inspect</div>
          )}
        </div>
      </div>
      ) : (
        /* Commands Tab */
        <div className="ops-grid">
          <div className="ops-list">
            <div className="ops-table" role="table">
              <div className="ops-row header" role="row">
                <div>Created</div>
                <div>Status</div>
                <div>Type</div>
                <div>Machine</div>
                <div>Target</div>
                <div>Proposed By</div>
              </div>
              {commands.length === 0 ? (
                <div className="empty">No commands</div>
              ) : (
                commands.map((cmd) => (
                  <button
                    key={cmd.proposalId}
                    type="button"
                    className={`ops-row ${selectedCommand?.proposalId === cmd.proposalId ? "selected" : ""}`}
                    onClick={() => setSelectedCommandId(cmd.proposalId)}
                  >
                    <div>{formatDate(cmd.createdAt)}</div>
                    <div>
                      <span className={`status ${cmd.status === "COMPLETED" ? "status-success" : cmd.status === "FAILED" || cmd.status === "REJECTED" ? "status-error" : "status-neutral"}`}>
                        {cmd.status}
                      </span>
                    </div>
                    <div>{cmd.command.commandType}</div>
                    <div>{cmd.command.machineId}</div>
                    <div>{cmd.command.targetValue ?? "-"} {cmd.command.targetUnit ?? ""}</div>
                    <div>{cmd.proposedBy}</div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="ops-detail">
            {selectedCommand ? (
              <div className="stack">
                <div className="panel-header">
                  <h3 className="panel-title">Command {selectedCommand.proposalId}</h3>
                  <div className="ops-actions">
                    {selectedCommand.status === "PENDING_APPROVAL" ? (
                      <>
                        <button
                          type="button"
                          className="primary"
                          onClick={() => setApprovalDialogCommand(selectedCommand)}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="secondary ghost"
                          onClick={() => setRejectionDialogCommand(selectedCommand)}
                        >
                          Reject
                        </button>
                      </>
                    ) : null}
                    {selectedCommand.status === "EXECUTING" ? (
                      <button
                        type="button"
                        className="primary"
                        style={{ backgroundColor: "#dc3545", borderColor: "#dc3545" }}
                        onClick={() => setAbortDialogCommand(selectedCommand)}
                      >
                        Emergency Abort
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="grid two-col">
                  <div className="field">
                    <span className="small-text">Status</span>
                    <strong>{selectedCommand.status}</strong>
                  </div>
                  <div className="field">
                    <span className="small-text">Type</span>
                    <span>{selectedCommand.command.commandType}</span>
                  </div>
                  <div className="field">
                    <span className="small-text">Machine</span>
                    <span>{selectedCommand.command.machineId}</span>
                  </div>
                  <div className="field">
                    <span className="small-text">Target</span>
                    <span>{selectedCommand.command.targetValue} {selectedCommand.command.targetUnit}</span>
                  </div>
                  <div className="field">
                    <span className="small-text">Proposed By</span>
                    <span>{selectedCommand.proposedBy} {selectedCommand.agentName ? `(${selectedCommand.agentName})` : ""}</span>
                  </div>
                  <div className="field">
                    <span className="small-text">Session</span>
                    <span>{selectedCommand.sessionId ?? "-"}</span>
                  </div>
                </div>

                <div className="panel">
                  <h4 className="panel-title">Reasoning</h4>
                  <p>{selectedCommand.reasoning}</p>
                </div>

                <SafetyInfoPanel
                  constraints={selectedCommand.command.constraints}
                  commandType={selectedCommand.command.commandType}
                  targetValue={selectedCommand.command.targetValue}
                  targetUnit={selectedCommand.command.targetUnit}
                />

                {selectedCommand.executionDurationMs != null ? (
                  <div className="panel">
                    <h4 className="panel-title">Execution</h4>
                    <div className="grid two-col small-text">
                      <div>Started: {formatDate(selectedCommand.executionStartedAt)}</div>
                      <div>Completed: {formatDate(selectedCommand.executionCompletedAt)}</div>
                      <div>Duration: {selectedCommand.executionDurationMs}ms</div>
                    </div>
                  </div>
                ) : null}

                {selectedCommand.outcome ? (
                  <div className="panel">
                    <h4 className="panel-title">Outcome</h4>
                    <pre className="code-block">{JSON.stringify(selectedCommand.outcome, null, 2)}</pre>
                  </div>
                ) : null}

                {commandSummary ? (
                  <div className="panel">
                    <h4 className="panel-title">Command Analytics Summary</h4>
                    <div className="grid two-col small-text">
                      <div>Pending Approvals: {commandSummary.pendingApprovals}</div>
                      <div>Active Executions: {commandSummary.activeExecutions}</div>
                      <div>24h Success Rate: {(commandSummary.last24Hours.successRate * 100).toFixed(1)}%</div>
                      <div>24h Total: {commandSummary.last24Hours.totalCommands}</div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="empty">Select a command to inspect</div>
            )}
          </div>
        </div>
      )}

      {activeTab === "missions" && showConfig ? (
        <div className="panel">
          <div className="panel-header">
            <h4 className="panel-title">Governor config (read-only)</h4>
            <span className="muted small-text">Editing disabled (T-022)</span>
          </div>
          <pre className="code-block">{JSON.stringify(config ?? {}, null, 2)}</pre>
        </div>
      ) : null}

      {error ? <div className="error-text">{error}</div> : null}

      {/* Command Approval Dialog */}
      {approvalDialogCommand ? (
        <CommandApprovalDialog
          command={approvalDialogCommand}
          onApprove={() => void handleApproveCommand()}
          onCancel={() => setApprovalDialogCommand(null)}
        />
      ) : null}

      {/* Command Rejection Dialog */}
      {rejectionDialogCommand ? (
        <CommandRejectionDialog
          command={rejectionDialogCommand}
          onReject={(reason) => void handleRejectCommand(reason)}
          onCancel={() => setRejectionDialogCommand(null)}
        />
      ) : null}

      {/* Emergency Abort Dialog */}
      {abortDialogCommand ? (
        <EmergencyAbortDialog
          command={abortDialogCommand}
          onAbort={() => void handleAbortCommand()}
          onCancel={() => setAbortDialogCommand(null)}
        />
      ) : null}
    </div>
  );
}
