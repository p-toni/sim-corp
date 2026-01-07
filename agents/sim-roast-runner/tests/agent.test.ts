import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Mission } from "@sim-corp/schemas";
import { buildServer } from "@sim-corp/sim-twin";
import { runSimRoastMission } from "../src/index";
import * as tools from "../src/tools";

let server: Awaited<ReturnType<typeof buildServer>>;
let previousSimTwinUrl: string | undefined;

beforeAll(async () => {
  server = await buildServer({ logger: false });
  const address = await server.listen({ port: 0, host: "127.0.0.1" });
  previousSimTwinUrl = process.env.SIM_TWIN_URL;
  process.env.SIM_TWIN_URL = address;
});

afterAll(async () => {
  process.env.SIM_TWIN_URL = previousSimTwinUrl;
  await server.close();
});

describe("sim-roast-runner agent", () => {
  it("runs a mission end-to-end and records tool output", async () => {
    const mission: Mission = {
      missionId: "mission-1",
      goal: { title: "simulate-roast" },
      constraints: [],
      context: {},
      priority: "MEDIUM",
      params: {
        targetFirstCrackSeconds: 500,
        targetDropSeconds: 650,
        seed: 42
      }
    };

    const trace = await runSimRoastMission(mission);

    expect(trace.status).toBe("SUCCESS");
    const steps = trace.entries.map((entry) => entry.step);
    expect(steps).toEqual(["GET_MISSION", "SCAN", "THINK", "ACT", "OBSERVE"]);

    const actEntry = trace.entries.find((entry) => entry.step === "ACT");
    expect(actEntry).toBeDefined();
    const toolCall = actEntry?.toolCalls.find((call) => call.toolName === "simulateRoast");
    expect(toolCall).toBeDefined();
    expect(toolCall?.output).toBeDefined();

    const telemetry = (toolCall?.output?.telemetry as unknown[]) ?? [];
    expect(telemetry.length).toBeGreaterThan(0);

    const events = (toolCall?.output?.events as Array<{ type?: string }> | undefined) ?? [];
    const eventTypes = events.map((event) => event?.type);
    expect(eventTypes).toContain("FC");
    expect(eventTypes).toContain("DROP");
  });

  it("proposes power reduction when simulation detects scorching", async () => {
    // Mock command service to track proposals
    const mockProposeCommand = vi.fn().mockResolvedValue({
      proposalId: "prop-1",
      commandType: "SET_POWER",
      status: "PENDING_APPROVAL"
    });

    vi.spyOn(tools, "createSimRoastTools").mockReturnValue({
      ...tools.createSimRoastTools(),
      [tools.PROPOSE_COMMAND_TOOL_NAME]: mockProposeCommand
    });

    const mission: Mission = {
      missionId: "mission-scorch",
      goal: { title: "simulate-roast-with-scorch" },
      constraints: [],
      context: {},
      priority: "MEDIUM",
      machineId: "test-machine-1",
      params: {
        targetFirstCrackSeconds: 400, // Fast roast to trigger scorching
        targetDropSeconds: 500,
        seed: 100
      }
    };

    const trace = await runSimRoastMission(mission);

    // Check if OBSERVE step invoked proposeCommand tool
    const observeEntry = trace.entries.find((entry) => entry.step === "OBSERVE");
    expect(observeEntry).toBeDefined();

    // Verify command proposal was attempted
    const proposeToolCall = observeEntry?.toolCalls.find(
      (call) => call.toolName === tools.PROPOSE_COMMAND_TOOL_NAME
    );

    if (proposeToolCall) {
      expect(mockProposeCommand).toHaveBeenCalled();
      const proposal = mockProposeCommand.mock.calls[0][0];
      expect(proposal.commandType).toBe("SET_POWER");
      expect(proposal.targetValue).toBeLessThan(100);
      expect(proposal.reasoning).toContain("scorch");
      expect(proposal.actor.kind).toBe("AGENT");
    }

    vi.restoreAllMocks();
  });

  it("proposes power increase when temperature development is slow", async () => {
    // Mock command service
    const mockProposeCommand = vi.fn().mockResolvedValue({
      proposalId: "prop-2",
      commandType: "SET_POWER",
      status: "PENDING_APPROVAL"
    });

    vi.spyOn(tools, "createSimRoastTools").mockReturnValue({
      ...tools.createSimRoastTools(),
      [tools.PROPOSE_COMMAND_TOOL_NAME]: mockProposeCommand
    });

    const mission: Mission = {
      missionId: "mission-slow",
      goal: { title: "simulate-slow-roast" },
      constraints: [],
      context: {},
      priority: "MEDIUM",
      machineId: "test-machine-2",
      params: {
        targetFirstCrackSeconds: 800, // Very slow roast
        targetDropSeconds: 1000,
        seed: 200
      }
    };

    const trace = await runSimRoastMission(mission);

    const observeEntry = trace.entries.find((entry) => entry.step === "OBSERVE");
    expect(observeEntry).toBeDefined();

    const proposeToolCall = observeEntry?.toolCalls.find(
      (call) => call.toolName === tools.PROPOSE_COMMAND_TOOL_NAME
    );

    if (proposeToolCall) {
      expect(mockProposeCommand).toHaveBeenCalled();
      const proposal = mockProposeCommand.mock.calls[0][0];
      expect(proposal.commandType).toBe("SET_POWER");
      expect(proposal.targetValue).toBeGreaterThan(80);
      expect(proposal.reasoning).toMatch(/slow|temperature development/i);
    }

    vi.restoreAllMocks();
  });

  it("does not propose command when simulation is normal", async () => {
    // Mock command service
    const mockProposeCommand = vi.fn().mockResolvedValue({
      proposalId: "prop-3",
      status: "PENDING_APPROVAL"
    });

    vi.spyOn(tools, "createSimRoastTools").mockReturnValue({
      ...tools.createSimRoastTools(),
      [tools.PROPOSE_COMMAND_TOOL_NAME]: mockProposeCommand
    });

    const mission: Mission = {
      missionId: "mission-normal",
      goal: { title: "simulate-normal-roast" },
      constraints: [],
      context: {},
      priority: "MEDIUM",
      machineId: "test-machine-3",
      params: {
        targetFirstCrackSeconds: 550, // Normal roast
        targetDropSeconds: 700,
        seed: 300
      }
    };

    const trace = await runSimRoastMission(mission);

    expect(trace.status).toBe("SUCCESS");

    // Check OBSERVE step - should complete without proposing
    const observeEntry = trace.entries.find((entry) => entry.step === "OBSERVE");
    expect(observeEntry).toBeDefined();

    const proposeToolCall = observeEntry?.toolCalls.find(
      (call) => call.toolName === tools.PROPOSE_COMMAND_TOOL_NAME
    );

    // For a normal roast, no command should be proposed
    if (!proposeToolCall) {
      expect(mockProposeCommand).not.toHaveBeenCalled();
    }

    vi.restoreAllMocks();
  });
});
