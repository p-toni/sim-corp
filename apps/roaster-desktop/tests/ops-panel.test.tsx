import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { OpsPanel } from "../src/components/OpsPanel";
import type { KernelMissionRecord } from "../src/lib/api";
import { approveMission, listMissions } from "../src/lib/api";

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

    expect(await screen.findByText(/Mission Ops/)).toBeTruthy();

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
});
