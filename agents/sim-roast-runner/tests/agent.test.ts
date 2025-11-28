import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Mission } from "@sim-corp/schemas";
import { buildServer } from "@sim-corp/sim-twin";
import { runSimRoastMission } from "../src/index";

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
});
