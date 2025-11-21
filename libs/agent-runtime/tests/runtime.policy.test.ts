import { describe, expect, it, vi } from "vitest";
import { AgentRuntime } from "../src/runtime";
import type { Reasoner, StepOutput } from "../src/types";
import type { AgentTraceStep } from "@sim-corp/schemas";
import { RuntimeTimeoutError } from "../src/errors";
import { createMission, createPolicy } from "./test-helpers.js";

const buildReasoner = (overrides?: Partial<StepOutput>) => {
  const reasoner: Reasoner = {
    async runStep(step, ctx) {
      const done = step === "OBSERVE";
      const base: StepOutput = {
        state: { ...ctx.state },
        done
      };
      if (step === "ACT" && overrides) {
        return { ...base, ...overrides };
      }
      return base;
    }
  };
  return reasoner;
};

describe("AgentRuntime policy + limits", () => {
  it("denies tools via policy and skips execution", async () => {
    const mission = createMission({ missionId: "mission-policy" });

    const toolCalls: StepOutput["toolInvocations"] = [
      { toolName: "denied", input: { text: "no" } },
      { toolName: "allowed", input: { text: "yes" } }
    ];

    const reasoner = buildReasoner({ toolInvocations: toolCalls });

    const deniedHandler = vi.fn();
    const allowedHandler = vi.fn(async () => ({ ok: true }));

    const policy = createPolicy((req) => (req.tool === "denied" ? "DENY" : "ALLOW"));

    const runtime = new AgentRuntime(
      reasoner,
      {
        denied: deniedHandler,
        allowed: allowedHandler
      },
      policy
    );

    const trace = await runtime.runMission(mission, { maxIterations: 1 });

    expect(deniedHandler).not.toHaveBeenCalled();
    expect(allowedHandler).toHaveBeenCalledTimes(1);

    const actStep = trace.entries.find((entry: AgentTraceStep) => entry.step === "ACT");
    expect(actStep).toBeDefined();
    expect(actStep?.toolCalls).toHaveLength(2);

    const deniedCall = actStep?.toolCalls.find((call) => call.toolName === "denied");
    expect(deniedCall?.deniedByPolicy).toBe(true);
    expect(deniedCall?.output).toBeUndefined();

    const allowedCall = actStep?.toolCalls.find((call) => call.toolName === "allowed");
    expect(allowedCall?.deniedByPolicy).toBeUndefined();
  });

  it("respects maxIterations option", async () => {
    const mission = createMission({ missionId: "mission-max" });
    const reasoner: Reasoner = {
      async runStep(step, ctx) {
        return {
          state: ctx.state,
          done: false
        };
      }
    };

    const runtime = new AgentRuntime(reasoner, {}, createPolicy(() => "ALLOW"));
    const trace = await runtime.runMission(mission, { maxIterations: 1 });

    expect(trace.status).toBe("MAX_ITERATIONS");
    expect(trace.metadata?.iterations).toBe(1);
    expect(trace.entries).toHaveLength(5);
  });

  it("throws RuntimeTimeoutError when timeout exceeded", async () => {
    const mission = createMission({ missionId: "mission-timeout" });
    const reasoner: Reasoner = {
      async runStep(step, ctx) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          state: ctx.state,
          done: step === "OBSERVE"
        };
      }
    };

    const runtime = new AgentRuntime(reasoner, {}, createPolicy(() => "ALLOW"));

    type RuntimeTimeoutWithTrace = RuntimeTimeoutError & {
      trace?: ReturnType<AgentRuntime["runMission"]> extends Promise<infer T> ? T : never;
    };

    let caught: RuntimeTimeoutWithTrace | undefined;
    try {
      await runtime.runMission(mission, { timeoutMs: 10 });
    } catch (err) {
      caught = err as RuntimeTimeoutWithTrace;
    }

    expect(caught).toBeInstanceOf(RuntimeTimeoutError);
    expect(caught?.trace).toBeDefined();
    expect(caught?.trace?.status).toBe("TIMEOUT");
  });
});
