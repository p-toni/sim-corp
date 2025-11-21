import { describe, expect, it } from "vitest";
import { AgentRuntime } from "../src/runtime";
import type { Reasoner } from "../src/types";
import type { AgentTraceStep } from "@sim-corp/schemas";
import { createAllowPolicy, createMission } from "./test-helpers.js";

const mission = createMission({ missionId: "mission-basic" });

const allowPolicy = createAllowPolicy();

describe("AgentRuntime basic loop", () => {
  it("runs each loop step once and completes when done", async () => {
    const seenSteps: string[] = [];
    const reasoner: Reasoner = {
      async runStep(step, ctx) {
        seenSteps.push(step);
        const done = step === "OBSERVE";
        return {
          state: { ...ctx.state, [`visited_${step}`]: true },
          done
        };
      }
    };

    const runtime = new AgentRuntime(reasoner, {}, allowPolicy);
    const trace = await runtime.runMission(mission);

    expect(trace.status).toBe("SUCCESS");
    expect(trace.metadata?.iterations).toBe(1);
    expect(trace.entries).toHaveLength(5);
    expect(trace.entries.map((entry: AgentTraceStep) => entry.step)).toEqual([
      "GET_MISSION",
      "SCAN",
      "THINK",
      "ACT",
      "OBSERVE"
    ]);
    expect(trace.entries.every((entry: AgentTraceStep) => entry.status === "SUCCESS")).toBe(
      true
    );
    expect(seenSteps).toEqual([
      "GET_MISSION",
      "SCAN",
      "THINK",
      "ACT",
      "OBSERVE"
    ]);
  });
});
