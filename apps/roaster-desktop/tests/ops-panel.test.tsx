import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { OpsPanel } from "../src/components/OpsPanel";
import type { KernelMissionRecord } from "../src/lib/api";
import { approveMission, listMissions } from "../src/lib/api";
import { abortCommand, listCommands } from "../src/lib/command-api";
import type { CommandProposal } from "@sim-corp/schemas";

vi.mock("../src/lib/api", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/api")>("../src/lib/api");
  return {
    ...actual,
    listMissions: vi.fn(),
    approveMission: vi.fn(),
    cancelMission: vi.fn(),
    retryNowMission: vi.fn(),
    getGovernorConfig: vi.fn()
  };
});

vi.mock("../src/lib/command-api", () => ({
  listCommands: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  getCommandSummary: vi.fn().mockResolvedValue(null),
  approveCommand: vi.fn(),
  rejectCommand: vi.fn(),
  executeCommand: vi.fn(),
  abortCommand: vi.fn(),
}));

const baseMission: KernelMissionRecord = {
  missionId: "m-1",
  id: "m-1",
  goal: { title: "generate-roast-report" },
  params: {},
  context: { machineId: "mx-1" },
  subjectId: "session-1",
  constraints: [],
  priority: "MEDIUM",
  status: "QUARANTINED",
  attempts: 1,
  maxAttempts: 3,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
  governance: {
    action: "BLOCK",
    confidence: "LOW",
    decidedAt: new Date(0).toISOString(),
    decidedBy: "GOVERNOR",
    reasons: [{ code: "MISSING_SIGNALS", message: "Signals incomplete" }]
  }
};

describe("OpsPanel", () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders mission list and shows governance reasons", async () => {
    (listMissions as unknown as vi.Mock).mockResolvedValue({ items: [baseMission] });

    render(<OpsPanel pollIntervalMs={60_000} />);

    expect(await screen.findByText(/Operations/)).toBeTruthy();

    const row = await screen.findByRole("button", { name: /session-1/i });
    await user.click(row);
    const governance = await screen.findByText(/MISSING_SIGNALS/);
    expect(governance).toBeTruthy();
  });

  it("approves a mission and refreshes the list", async () => {
    const approvedMission = { ...baseMission, status: "PENDING" as const };
    (listMissions as unknown as vi.Mock).mockResolvedValueOnce({ items: [baseMission] });
    (listMissions as unknown as vi.Mock).mockResolvedValueOnce({ items: [approvedMission] });
    (approveMission as unknown as vi.Mock).mockResolvedValue(approvedMission);

    render(<OpsPanel pollIntervalMs={60_000} />);

    const row = await screen.findByRole("button", { name: /session-1/i });
    await user.click(row);
    await user.click(screen.getByRole("button", { name: /Approve/i }));

    await waitFor(() => {
      expect(listMissions).toHaveBeenCalledTimes(2);
    });

    const statusCell = within(screen.getByRole("button", { name: /session-1/i })).getByText(/PENDING/);
    expect(statusCell).toBeTruthy();
    expect(approveMission).toHaveBeenCalledWith("m-1");
  });

  it("shows emergency abort button for executing commands", async () => {
    const executingCommand: CommandProposal = {
      proposalId: "cmd-1",
      command: {
        commandId: "c-1",
        commandType: "SET_POWER",
        machineId: "mx-1",
        targetValue: 85,
        targetUnit: "%",
        constraints: {},
      },
      status: "EXECUTING",
      reasoning: "Adjusting power",
      proposedBy: "AGENT",
      agentName: "sim-roast-runner",
      createdAt: new Date(0).toISOString(),
      auditLog: [],
    };

    (listCommands as unknown as vi.Mock).mockResolvedValue({ items: [executingCommand], total: 1 });
    (listMissions as unknown as vi.Mock).mockResolvedValue({ items: [] });

    render(<OpsPanel pollIntervalMs={60_000} />);

    // Switch to Commands tab
    await user.click(await screen.findByRole("button", { name: /Commands/i }));

    // Select the executing command
    const cmdRow = await screen.findByRole("button", { name: /SET_POWER/i });
    await user.click(cmdRow);

    // Verify Emergency Abort button is shown
    const abortButton = await screen.findByRole("button", { name: /Emergency Abort/i });
    expect(abortButton).toBeTruthy();
  });

  it("aborts an executing command successfully", async () => {
    const executingCommand: CommandProposal = {
      proposalId: "cmd-1",
      command: {
        commandId: "c-1",
        commandType: "SET_POWER",
        machineId: "mx-1",
        targetValue: 85,
        targetUnit: "%",
        constraints: {},
      },
      status: "EXECUTING",
      reasoning: "Adjusting power",
      proposedBy: "AGENT",
      agentName: "sim-roast-runner",
      createdAt: new Date(0).toISOString(),
      auditLog: [],
    };

    const abortedCommand = { ...executingCommand, status: "ABORTED" as const };

    (listCommands as unknown as vi.Mock)
      .mockResolvedValueOnce({ items: [executingCommand], total: 1 })
      .mockResolvedValueOnce({ items: [abortedCommand], total: 1 });
    (listMissions as unknown as vi.Mock).mockResolvedValue({ items: [] });
    (abortCommand as unknown as vi.Mock).mockResolvedValue({
      commandId: "c-1",
      status: "ACCEPTED",
      message: "Command aborted",
      executedAt: new Date().toISOString(),
    });

    render(<OpsPanel pollIntervalMs={60_000} />);

    // Switch to Commands tab
    await user.click(await screen.findByRole("button", { name: /Commands/i }));

    // Select the executing command
    const cmdRow = await screen.findByRole("button", { name: /SET_POWER/i });
    await user.click(cmdRow);

    // Click Emergency Abort button
    await user.click(await screen.findByRole("button", { name: /Emergency Abort/i }));

    // Dialog should appear - find checkbox and confirm
    const checkbox = await screen.findByRole("checkbox");
    await user.click(checkbox);

    // Click the abort button in dialog
    const confirmAbortButton = screen.getAllByRole("button", { name: /Emergency Abort/i })[1];
    await user.click(confirmAbortButton);

    // Verify abort was called
    await waitFor(() => {
      expect(abortCommand).toHaveBeenCalledWith("cmd-1");
    });

    // Verify commands list was refreshed
    await waitFor(() => {
      expect(listCommands).toHaveBeenCalledTimes(2);
    });
  });

  it("shows error alert when abort fails", async () => {
    const executingCommand: CommandProposal = {
      proposalId: "cmd-1",
      command: {
        commandId: "c-1",
        commandType: "SET_POWER",
        machineId: "mx-1",
        targetValue: 85,
        targetUnit: "%",
        constraints: {},
      },
      status: "EXECUTING",
      reasoning: "Adjusting power",
      proposedBy: "AGENT",
      agentName: "sim-roast-runner",
      createdAt: new Date(0).toISOString(),
      auditLog: [],
    };

    (listCommands as unknown as vi.Mock).mockResolvedValue({ items: [executingCommand], total: 1 });
    (listMissions as unknown as vi.Mock).mockResolvedValue({ items: [] });
    (abortCommand as unknown as vi.Mock).mockResolvedValue({
      commandId: "c-1",
      status: "FAILED",
      message: "Driver communication error",
      executedAt: new Date().toISOString(),
      errorCode: "DRIVER_ERROR",
    });

    render(<OpsPanel pollIntervalMs={60_000} />);

    // Switch to Commands tab
    await user.click(await screen.findByRole("button", { name: /Commands/i }));

    // Select the executing command
    const cmdRow = await screen.findByRole("button", { name: /SET_POWER/i });
    await user.click(cmdRow);

    // Click Emergency Abort button
    await user.click(await screen.findByRole("button", { name: /Emergency Abort/i }));

    // Confirm abort
    const checkbox = await screen.findByRole("checkbox");
    await user.click(checkbox);
    const confirmAbortButton = screen.getAllByRole("button", { name: /Emergency Abort/i })[1];
    await user.click(confirmAbortButton);

    // Verify critical error message is shown
    await waitFor(() => {
      const errorMessage = screen.getByText(/ABORT FAILED.*Driver communication error.*Manual intervention required/i);
      expect(errorMessage).toBeTruthy();
    });
  });
});
