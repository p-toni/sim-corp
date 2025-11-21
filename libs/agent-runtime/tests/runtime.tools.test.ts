import { describe, expect, it, vi } from "vitest";
import { AgentRuntime } from "../src/runtime";
import type { Reasoner, StepContext, StepOutput } from "../src/types";
import type { AgentTraceStep } from "@sim-corp/schemas";
import { createAllowPolicy, createMission } from "./test-helpers.js";

const mission = createMission({ missionId: "mission-tools" });

const buildReasoner = (invocations: StepOutput["toolInvocations"]) => {
  const reasoner: Reasoner = {
    async runStep(step, ctx) {
      const done = step === "OBSERVE";
      if (step === "ACT") {
        return {
          state: ctx.state,
          toolInvocations: invocations,
          done
        };
      }
      return {
        state: ctx.state,
        done
      };
    }
  };
  return reasoner;
};

describe("AgentRuntime tool handling", () => {
  it("executes registered tools and records results", async () => {
    const toolHandler = vi.fn(async (input: unknown, ctx: StepContext) => ({
      echoed: input,
      stateKeys: Object.keys(ctx.state)
    }));

    const instrumentation = {
      onStepEnd: vi.fn()
    };

    const reasoner = buildReasoner([
      {
        toolName: "echo",
        input: { text: "hello" }
      }
    ]);

    const runtime = new AgentRuntime(
      reasoner,
      { echo: toolHandler },
      createAllowPolicy(),
      instrumentation
    );

    const trace = await runtime.runMission(mission);

    expect(toolHandler).toHaveBeenCalledTimes(1);
    const call = toolHandler.mock.calls[0];
    expect(call?.[0]).toEqual({ text: "hello" });

    const actStep = trace.entries.find((entry: AgentTraceStep) => entry.step === "ACT");
    expect(actStep).toBeDefined();
    expect(actStep?.toolCalls).toHaveLength(1);
    expect(actStep?.toolCalls[0]).toMatchObject({
      toolName: "echo",
      deniedByPolicy: undefined
    });

    expect(instrumentation.onStepEnd).toHaveBeenCalled();
    const actEndCall = instrumentation.onStepEnd.mock.calls.find((call) => call[0].step === "ACT");
    expect(actEndCall?.[0].toolResults).toHaveLength(1);
    expect(actEndCall?.[0].toolResults[0]).toMatchObject({ toolName: "echo" });
  });
});
