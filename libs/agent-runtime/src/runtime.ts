import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { RuntimeAbortError, RuntimeTimeoutError } from "./errors";
import {
  Instrumentation,
  LoopStep,
  PolicyChecker,
  Reasoner,
  RuntimeOptions,
  StepContext,
  StepOutput,
  ToolInvocation,
  ToolRegistry,
  ToolResult
} from "./types";
import type {
  AgentTrace,
  AgentTraceStep,
  Mission,
  PolicyCheckRequest
} from "@sim-corp/schemas";

const LOOP_STEPS: LoopStep[] = ["GET_MISSION", "SCAN", "THINK", "ACT", "OBSERVE"];
const DEFAULT_MAX_ITERATIONS = 3;

// We re-run the full loop sequence on every iteration so agents can rescan/think with updated state.
export class AgentRuntime {
  constructor(
    private readonly reasoner: Reasoner,
    private readonly tools: ToolRegistry,
    private readonly policy: PolicyChecker,
    private readonly instrumentation?: Instrumentation
  ) {}

  async runMission(mission: Mission, opts: RuntimeOptions = {}): Promise<AgentTrace> {
    const {
      maxIterations = DEFAULT_MAX_ITERATIONS,
      timeoutMs,
      signal,
      agentId = "agent-runtime",
      traceId = randomUUID(),
      loopId = randomUUID(),
      initialState = {}
    } = opts;

    const steps: AgentTraceStep[] = [];
    const scratch: Record<string, unknown> = {};
    let currentState: Record<string, unknown> = { ...initialState };
    const startedAt = new Date();
    let iterationsRun = 0;

    const { combinedSignal, cleanup } = this.createRuntimeSignal(signal, timeoutMs);

    try {
      for (let iteration = 0; iteration < maxIterations; iteration += 1) {
        iterationsRun = iteration + 1;

        for (const step of LOOP_STEPS) {
          this.ensureNotAborted(combinedSignal);

          const ctxState = { ...currentState };
          const ctx: StepContext = {
            mission,
            state: ctxState,
            scratch
          };

          await this.instrumentation?.onStepStart?.({
            mission,
            step,
            iteration,
            ctx
          });

          let output: StepOutput | undefined;
          const toolResults: ToolResult[] = [];
          let stepError: Error | undefined;
          const stepStartedAt = new Date();

          try {
            output = await this.waitFor(this.reasoner.runStep(step, ctx), combinedSignal);
            currentState = { ...currentState, ...output.state };

            const invocations = output.toolInvocations ?? [];
            for (const invocation of invocations) {
              this.ensureNotAborted(combinedSignal);
              const result = await this.handleToolInvocation({
                mission,
                agentId,
                invocation,
                ctx,
                signal: combinedSignal
              });
              toolResults.push(result);
              if (result.error) {
                throw result.error;
              }
            }
          } catch (err) {
            stepError = err instanceof Error ? err : new Error("Unknown step error");
            throw stepError;
          } finally {
            const stepCompletedAt = new Date();
            const safeOutput: StepOutput = output ?? { state: { ...currentState } };
            const traceStep = this.createTraceStep({
              mission,
              loopId,
              iteration,
              step,
              toolResults,
              startedAt: stepStartedAt,
              completedAt: stepCompletedAt,
              output: safeOutput,
              error: stepError
            });
            steps.push(traceStep);

            await this.instrumentation?.onStepEnd?.({
              mission,
              step,
              iteration,
              ctx,
              output: safeOutput,
              toolResults,
              error: stepError
            });
          }

          if (output?.done) {
            const completedAt = new Date();
            return this.buildTrace({
              traceId,
              agentId,
              mission,
              loopId,
              steps,
              startedAt,
              completedAt,
              status: "SUCCESS",
              iterations: iterationsRun
            });
          }
        }
      }

      const completedAt = new Date();
      const status: AgentTrace["status"] = "MAX_ITERATIONS";
      return this.buildTrace({
        traceId,
        agentId,
        mission,
        loopId,
        steps,
        startedAt,
        completedAt,
        status,
        iterations: iterationsRun
      });
    } catch (err) {
      const completedAt = new Date();
      const mappedError = this.toRuntimeError(err);
      const status = mappedError instanceof RuntimeTimeoutError
        ? "TIMEOUT"
        : mappedError instanceof RuntimeAbortError
          ? "ABORTED"
          : "ERROR";

      mappedError.trace = this.buildTrace({
        traceId,
        agentId,
        mission,
        loopId,
        steps,
        startedAt,
        completedAt,
        status,
        error: mappedError,
        iterations: iterationsRun
      });

      throw mappedError;
    } finally {
      cleanup();
    }
  }

  private async handleToolInvocation(args: {
    mission: Mission;
    agentId: string;
    invocation: ToolInvocation;
    ctx: StepContext;
    signal?: AbortSignal;
  }): Promise<ToolResult> {
    const { mission, agentId, invocation, ctx, signal } = args;
    this.ensureNotAborted(signal);

    const policyRequest: PolicyCheckRequest = {
      agentId,
      tool: invocation.toolName,
      action: "invoke", // TODO(@human): expand action/resource taxonomy once tools declare operations.
      resource: mission.missionId ?? mission.id ?? "mission",
      missionId: mission.missionId ?? mission.id,
      context: {
        missionContext: mission.context ?? {}
      }
    };

    const policyResult = await this.waitFor(this.policy.check(policyRequest), signal);
    if (policyResult.decision === "DENY") {
      return {
        toolName: invocation.toolName,
        input: invocation.input,
        output: undefined,
        deniedByPolicy: true
      };
    }

    const handler = this.tools[invocation.toolName];
    if (!handler) {
      return {
        toolName: invocation.toolName,
        input: invocation.input,
        output: undefined,
        error: new Error(`Tool not found: ${invocation.toolName}`)
      };
    }

    this.ensureNotAborted(signal);

    const start = performance.now();
    try {
      const output = await this.waitFor(handler(invocation.input, ctx), signal);
      return {
        toolName: invocation.toolName,
        input: invocation.input,
        output,
        durationMs: performance.now() - start
      };
    } catch (err) {
      if (err instanceof RuntimeAbortError || err instanceof RuntimeTimeoutError) {
        throw err;
      }
      return {
        toolName: invocation.toolName,
        input: invocation.input,
        output: undefined,
        durationMs: performance.now() - start,
        error: err instanceof Error ? err : new Error("Tool error")
      };
    }
  }

  private createTraceStep(args: {
    mission: Mission;
    loopId: string;
    iteration: number;
    step: LoopStep;
    toolResults: ToolResult[];
    startedAt: Date;
    completedAt: Date;
    output: StepOutput;
    error?: Error;
  }): AgentTraceStep {
    const { mission, loopId, iteration, step, toolResults, startedAt, completedAt, output, error } =
      args;
    return {
      missionId: mission.missionId ?? mission.id ?? "mission-unknown",
      loopId,
      iteration,
      step,
      status: error ? "ERROR" : "SUCCESS",
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      toolCalls: toolResults.map((result) => ({
        toolName: result.toolName,
        input: this.toJsonRecord(result.input),
        output: this.toJsonRecord(result.output),
        durationMs: result.durationMs,
        deniedByPolicy: result.deniedByPolicy,
        error: result.error
          ? {
              message: result.error.message,
              code: result.error.name
            }
          : undefined
      })),
      metrics: [],
      notes: output.notes
    };
  }

  private buildTrace(args: {
    traceId: string;
    agentId: string;
    mission: Mission;
    loopId: string;
    steps: AgentTraceStep[];
    startedAt: Date;
    completedAt: Date;
    status: AgentTrace["status"];
    iterations: number;
    error?: Error;
  }): AgentTrace {
    const {
      traceId,
      agentId,
      mission,
      loopId,
      steps,
      startedAt,
      completedAt,
      status,
      iterations,
      error
    } = args;

    return {
      traceId,
      agentId,
      missionId: mission.missionId ?? mission.id ?? "mission-unknown",
      mission,
      status,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      error: error
        ? {
            message: error.message,
            stack: error.stack
          }
        : undefined,
      entries: steps,
      metadata: {
        loopId,
        iterations
      }
    };
  }

  private createRuntimeSignal(signal?: AbortSignal, timeoutMs?: number): {
    combinedSignal?: AbortSignal;
    cleanup: () => void;
  } {
    if (!signal && typeof timeoutMs !== "number") {
      return { combinedSignal: undefined, cleanup: () => {} };
    }

    const controller = new AbortController();
    const cleanups: Array<() => void> = [];

    if (signal) {
      if (signal.aborted) {
        controller.abort(signal.reason ?? new RuntimeAbortError());
      } else {
        const onAbort = () => {
          controller.abort(signal.reason ?? new RuntimeAbortError());
        };
        signal.addEventListener("abort", onAbort, { once: true });
        cleanups.push(() => signal.removeEventListener("abort", onAbort));
      }
    }

    if (typeof timeoutMs === "number") {
      const timeoutHandle = setTimeout(() => {
        controller.abort(new RuntimeTimeoutError());
      }, timeoutMs);
      cleanups.push(() => {
        clearTimeout(timeoutHandle);
      });
    }

    return {
      combinedSignal: controller.signal,
      cleanup: () => cleanups.forEach((fn) => fn())
    };
  }

  private ensureNotAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) {
      return;
    }

    const reason = signal.reason;
    if (reason instanceof RuntimeTimeoutError) {
      throw reason;
    }
    if (reason instanceof RuntimeAbortError) {
      throw reason;
    }
    if (reason instanceof Error) {
      throw reason;
    }
    throw new RuntimeAbortError();
  }

  private toRuntimeError(err: unknown): Error & { trace?: AgentTrace } {
    if (err instanceof RuntimeTimeoutError || err instanceof RuntimeAbortError) {
      return err;
    }
    if (err instanceof Error) {
      return err;
    }
    return new Error("Unknown runtime error");
  }

  private toJsonRecord(value: unknown): Record<string, unknown> | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return { value };
  }

  private waitFor<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) {
      return promise;
    }
    if (signal.aborted) {
      this.ensureNotAborted(signal);
      return promise;
    }

    return new Promise<T>((resolve, reject) => {
      const onAbort = () => {
        signal.removeEventListener("abort", onAbort);
        try {
          this.ensureNotAborted(signal);
        } catch (err) {
          reject(err);
        }
      };

      promise
        .then((value) => {
          signal.removeEventListener("abort", onAbort);
          resolve(value);
        })
        .catch((err) => {
          signal.removeEventListener("abort", onAbort);
          reject(err);
        });

      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
}
