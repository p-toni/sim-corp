import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AgentTrace } from "@sim-corp/schemas";
import { App } from "../src/app";
import { vi } from "vitest";

const fakeTrace: AgentTrace = {
  traceId: "trace-1",
  agentId: "sim-roast-runner",
  missionId: "mission-1",
  mission: {
    missionId: "mission-1",
    goal: { title: "simulate-roast" },
    constraints: [],
    params: {
      targetFirstCrackSeconds: 500,
      targetDropSeconds: 650,
      seed: 42
    },
    context: {},
    priority: "MEDIUM"
  },
  status: "SUCCESS",
  startedAt: new Date(0).toISOString(),
  completedAt: new Date(1000).toISOString(),
  entries: [
    {
      missionId: "mission-1",
      loopId: "loop-1",
      iteration: 0,
      step: "GET_MISSION",
      status: "SUCCESS",
      startedAt: new Date(0).toISOString(),
      completedAt: new Date(1).toISOString(),
      toolCalls: [],
      metrics: [],
      notes: "mission loaded"
    },
    {
      missionId: "mission-1",
      loopId: "loop-1",
      iteration: 0,
      step: "SCAN",
      status: "SUCCESS",
      startedAt: new Date(2).toISOString(),
      completedAt: new Date(3).toISOString(),
      toolCalls: [],
      metrics: [],
      notes: "env scanned"
    },
    {
      missionId: "mission-1",
      loopId: "loop-1",
      iteration: 0,
      step: "THINK",
      status: "SUCCESS",
      startedAt: new Date(4).toISOString(),
      completedAt: new Date(5).toISOString(),
      toolCalls: [],
      metrics: [],
      notes: "simulation request prepared"
    },
    {
      missionId: "mission-1",
      loopId: "loop-1",
      iteration: 0,
      step: "ACT",
      status: "SUCCESS",
      startedAt: new Date(6).toISOString(),
      completedAt: new Date(7).toISOString(),
      toolCalls: [
        {
          toolName: "simulateRoast",
          input: {},
          output: {
            telemetry: [
              {
                ts: new Date(0).toISOString(),
                machineId: "SIM-MACHINE",
                elapsedSeconds: 0,
                btC: 180,
                etC: 185,
                rorCPerMin: 0
              },
              {
                ts: new Date(2000).toISOString(),
                machineId: "SIM-MACHINE",
                elapsedSeconds: 2,
                btC: 182,
                etC: 187,
                rorCPerMin: 60
              },
              {
                ts: new Date(4000).toISOString(),
                machineId: "SIM-MACHINE",
                elapsedSeconds: 4,
                btC: 186,
                etC: 191,
                rorCPerMin: 60
              }
            ],
            events: [
              {
                ts: new Date(0).toISOString(),
                machineId: "SIM-MACHINE",
                type: "CHARGE",
                payload: { elapsedSeconds: 0 }
              },
              {
                ts: new Date(2000).toISOString(),
                machineId: "SIM-MACHINE",
                type: "TP",
                payload: { elapsedSeconds: 2 }
              },
              {
                ts: new Date(500000).toISOString(),
                machineId: "SIM-MACHINE",
                type: "FC",
                payload: { elapsedSeconds: 500 }
              },
              {
                ts: new Date(650000).toISOString(),
                machineId: "SIM-MACHINE",
                type: "DROP",
                payload: { elapsedSeconds: 650 }
              }
            ]
          },
          durationMs: 20,
          deniedByPolicy: false
        }
      ],
      metrics: [],
      notes: "calling sim-twin"
    },
    {
      missionId: "mission-1",
      loopId: "loop-1",
      iteration: 0,
      step: "OBSERVE",
      status: "SUCCESS",
      startedAt: new Date(8).toISOString(),
      completedAt: new Date(9).toISOString(),
      toolCalls: [],
      metrics: [],
      notes: "completed"
    }
  ],
  metadata: {
    loopId: "loop-1",
    iterations: 1
  }
};

describe("roaster desktop app", () => {
  it("runs a mission and renders telemetry + timeline", async () => {
    const runner = vi.fn().mockResolvedValue(fakeTrace);
    const user = userEvent.setup();

    render(<App runMission={runner} />);

    await user.click(screen.getByRole("button", { name: /run sim roast mission/i }));

    const statuses = await screen.findAllByText((content, element) => {
      return element?.textContent?.includes("Status: Complete") ?? false;
    });

    expect(statuses.length).toBeGreaterThan(0);
    expect(runner).toHaveBeenCalled();
    expect(await screen.findByText(/Telemetry: 3/)).toBeTruthy();
    expect(screen.getByText(/ACT/)).toBeTruthy();
    expect(screen.getByText(/OBSERVE/)).toBeTruthy();
  });
});
