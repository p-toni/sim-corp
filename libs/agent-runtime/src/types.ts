import type {
  AgentTrace,
  AgentTraceStep,
  Mission,
  PolicyCheckRequest,
  PolicyCheckResult
} from "@sim-corp/schemas";

export type LoopStep = "GET_MISSION" | "SCAN" | "THINK" | "ACT" | "OBSERVE";

export interface ToolInvocation {
  toolName: string;
  input: unknown;
}

export interface ToolResult {
  toolName: string;
  input: unknown;
  output: unknown;
  error?: Error;
  deniedByPolicy?: boolean;
  durationMs?: number;
}

export interface StepContext {
  mission: Mission;
  state: Record<string, unknown>;
  scratch?: Record<string, unknown>;
}

export interface StepOutput {
  state: Record<string, unknown>;
  toolInvocations?: ToolInvocation[];
  done?: boolean;
  notes?: string;
}

export interface Reasoner {
  runStep(step: LoopStep, ctx: StepContext): Promise<StepOutput>;
}

export interface ToolHandler {
  (input: unknown, ctx: StepContext): Promise<unknown>;
}

export interface ToolRegistry {
  [toolName: string]: ToolHandler;
}

export interface PolicyChecker {
  check(req: PolicyCheckRequest): Promise<PolicyCheckResult>;
}

export interface Instrumentation {
  onStepStart?(args: {
    mission: Mission;
    step: LoopStep;
    iteration: number;
    ctx: StepContext;
  }): void | Promise<void>;

  onStepEnd?(args: {
    mission: Mission;
    step: LoopStep;
    iteration: number;
    ctx: StepContext;
    output: StepOutput;
    toolResults: ToolResult[];
    error?: Error;
  }): void | Promise<void>;
}

export interface RuntimeOptions {
  maxIterations?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  agentId?: string;
  traceId?: string;
  loopId?: string;
  initialState?: Record<string, unknown>;
}

export type { AgentTrace, AgentTraceStep, Mission, PolicyCheckRequest, PolicyCheckResult };
