import type { LoopStep, Reasoner, StepContext, StepOutput } from "@sim-corp/agent-runtime";
import type { Mission, TelemetryPoint, RoastEvent, ProposeCommandRequest } from "@sim-corp/schemas";
import { SimRoastRequestSchema, type SimRoastRequest } from "../../../services/sim-twin/src/client";
import { SIMULATE_ROAST_TOOL_NAME, PROPOSE_COMMAND_TOOL_NAME } from "./tools";

const SIM_TWIN_DEFAULT_URL = "http://127.0.0.1:4002";

interface SimRoastState {
  missionParams?: Record<string, unknown>;
  simTwinUrl?: string;
  simRequest?: SimRoastRequest;
  simulationResults?: {
    telemetry: TelemetryPoint[];
    events: RoastEvent[];
  };
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

interface SimulationAnalysis {
  shouldPropose: boolean;
  commandType?: "SET_POWER" | "SET_FAN" | "SET_DRUM";
  targetValue?: number;
  reasoning?: string;
  targetUnit?: string;
}

function analyzeSimulationResults(
  telemetry: TelemetryPoint[],
  events: RoastEvent[]
): SimulationAnalysis {
  // Analyze telemetry for temperature trends
  const beanTemps = telemetry
    .filter(t => t.metric === "bean_temp" && typeof t.value === "number")
    .map(t => ({ timestamp: t.timestamp, value: t.value as number }))
    .sort((a, b) => a.timestamp - b.timestamp);

  // Check for dangerous events
  const hasScorc = events.some(e => e.eventType === "SCORCH");
  const hasTipping = events.some(e => e.eventType === "TIPPING");

  // If scorching detected, recommend power reduction
  if (hasScorc) {
    return {
      shouldPropose: true,
      commandType: "SET_POWER",
      targetValue: 75,
      targetUnit: "%",
      reasoning: "Simulation detected scorching event. Reducing power to 75% may prevent bean damage and improve roast quality."
    };
  }

  // If tipping not detected by expected time, recommend power increase
  if (!hasTipping && telemetry.length > 0) {
    const avgBeanTemp = beanTemps.length > 0
      ? beanTemps.reduce((sum, t) => sum + t.value, 0) / beanTemps.length
      : 0;

    if (avgBeanTemp < 180) {
      return {
        shouldPropose: true,
        commandType: "SET_POWER",
        targetValue: 90,
        targetUnit: "%",
        reasoning: "Simulation shows slow temperature development (avg bean temp < 180°F). Increasing power to 90% may improve roast progression."
      };
    }
  }

  // Check for rapid temperature rise (need fan adjustment)
  if (beanTemps.length >= 2) {
    const recentTemps = beanTemps.slice(-10);
    if (recentTemps.length >= 2) {
      const tempChange = recentTemps[recentTemps.length - 1].value - recentTemps[0].value;
      const timeChange = recentTemps[recentTemps.length - 1].timestamp - recentTemps[0].timestamp;
      const rateOfRise = timeChange > 0 ? (tempChange / timeChange) * 60 : 0; // per minute

      if (rateOfRise > 25) {
        return {
          shouldPropose: true,
          commandType: "SET_FAN",
          targetValue: 8,
          targetUnit: "speed",
          reasoning: `Simulation shows rapid temperature rise (${rateOfRise.toFixed(1)}°F/min). Increasing fan to level 8 may moderate heat and improve roast control.`
        };
      }
    }
  }

  return { shouldPropose: false };
}

async function handleObserve(ctx: StepContext): Promise<StepOutput> {
  // Extract simulation results from tool results
  const simToolResult = ctx.toolResults?.find(r => r.toolName === SIMULATE_ROAST_TOOL_NAME);

  if (!simToolResult || !simToolResult.result) {
    return {
      state: { ...ctx.state },
      done: true,
      notes: "completed - no simulation results"
    };
  }

  const simulationResults = simToolResult.result as {
    telemetry: TelemetryPoint[];
    events: RoastEvent[];
  };

  // Analyze simulation results
  const analysis = analyzeSimulationResults(simulationResults.telemetry, simulationResults.events);

  // If we should propose a command, prepare the proposal
  if (analysis.shouldPropose && analysis.commandType && analysis.targetValue !== undefined) {
    const proposalRequest: ProposeCommandRequest = {
      commandType: analysis.commandType,
      targetValue: analysis.targetValue,
      targetUnit: analysis.targetUnit,
      reasoning: analysis.reasoning ?? "Command proposed based on simulation analysis",
      machineId: ctx.mission.machineId ?? "unknown",
      sessionId: ctx.sessionId,
      missionId: ctx.mission.missionId,
      actor: {
        kind: "AGENT",
        id: "sim-roast-runner",
        display: "Sim Roast Runner Agent"
      },
      constraints: {
        minValue: analysis.commandType === "SET_POWER" ? 0 : undefined,
        maxValue: analysis.commandType === "SET_POWER" ? 100 :
                  analysis.commandType === "SET_FAN" ? 10 : undefined
      }
    };

    return {
      state: mergeState(ctx, { simulationResults }),
      toolInvocations: [
        {
          toolName: PROPOSE_COMMAND_TOOL_NAME,
          input: proposalRequest
        }
      ],
      notes: `Proposing ${analysis.commandType} command: ${analysis.reasoning}`
    };
  }

  return {
    state: mergeState(ctx, { simulationResults }),
    done: true,
    notes: "completed - no command proposal needed"
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
