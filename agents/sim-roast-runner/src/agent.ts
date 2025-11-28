import type { LoopStep, Reasoner, StepContext, StepOutput } from "@sim-corp/agent-runtime";
import type { Mission } from "@sim-corp/schemas";
import { SimRoastRequestSchema, type SimRoastRequest } from "@sim-corp/sim-twin";
import { SIMULATE_ROAST_TOOL_NAME } from "./tools";

const SIM_TWIN_DEFAULT_URL = "http://127.0.0.1:4002";

interface SimRoastState {
  missionParams?: Record<string, unknown>;
  simTwinUrl?: string;
  simRequest?: SimRoastRequest;
}

function mergeState(ctx: StepContext, patch: SimRoastState): Record<string, unknown> {
  return { ...ctx.state, ...patch };
}

function readMissionParams(mission: Mission): Record<string, unknown> {
  if (mission.params && typeof mission.params === "object") {
    return { ...mission.params };
  }
  return {};
}

function buildSimRoastRequest(params: Record<string, unknown>): SimRoastRequest {
  return SimRoastRequestSchema.parse(params ?? {});
}

function getSimRequest(state: SimRoastState): SimRoastRequest {
  if (!state.simRequest) {
    throw new Error("Missing simulation request in state");
  }
  return state.simRequest;
}

async function handleGetMission(ctx: StepContext): Promise<StepOutput> {
  const missionParams = readMissionParams(ctx.mission);
  return {
    state: mergeState(ctx, { missionParams }),
    notes: "mission loaded"
  };
}

async function handleScan(ctx: StepContext): Promise<StepOutput> {
  const simTwinUrl = process.env.SIM_TWIN_URL ?? SIM_TWIN_DEFAULT_URL;
  return {
    state: mergeState(ctx, { simTwinUrl }),
    notes: "env scanned"
  };
}

async function handleThink(ctx: StepContext): Promise<StepOutput> {
  const missionParams = (ctx.state.missionParams as Record<string, unknown> | undefined) ??
    readMissionParams(ctx.mission);
  const simRequest = buildSimRoastRequest(missionParams);
  return {
    state: mergeState(ctx, { missionParams, simRequest }),
    notes: "simulation request prepared"
  };
}

async function handleAct(ctx: StepContext): Promise<StepOutput> {
  const state = ctx.state as SimRoastState;
  const simRequest = getSimRequest(state);
  return {
    state: { ...ctx.state },
    toolInvocations: [
      {
        toolName: SIMULATE_ROAST_TOOL_NAME,
        input: simRequest
      }
    ],
    notes: "calling sim-twin"
  };
}

async function handleObserve(ctx: StepContext): Promise<StepOutput> {
  return {
    state: { ...ctx.state },
    done: true,
    notes: "completed"
  };
}

export const simRoastReasoner: Reasoner = {
  async runStep(step: LoopStep, ctx: StepContext) {
    switch (step) {
      case "GET_MISSION":
        return handleGetMission(ctx);
      case "SCAN":
        return handleScan(ctx);
      case "THINK":
        return handleThink(ctx);
      case "ACT":
        return handleAct(ctx);
      case "OBSERVE":
        return handleObserve(ctx);
      default:
        return { state: { ...ctx.state } };
    }
  }
};
