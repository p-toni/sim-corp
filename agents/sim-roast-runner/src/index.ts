import { AgentRuntime } from "@sim-corp/agent-runtime";
import type { PolicyChecker } from "@sim-corp/agent-runtime";
import type { AgentTrace, Mission, PolicyCheckRequest, PolicyCheckResult } from "@sim-corp/schemas";
import { createSimRoastTools } from "./tools";
import { simRoastReasoner } from "./agent";

const ALLOW_POLICY: PolicyChecker = {
  async check(request: PolicyCheckRequest): Promise<PolicyCheckResult> {
    return {
      request: {
        ...request,
        context: request.context ?? {}
      },
      decision: "ALLOW",
      checkedAt: new Date().toISOString(),
      violations: []
    };
  }
};

export async function runSimRoastMission(mission: Mission): Promise<AgentTrace> {
  const runtime = new AgentRuntime(simRoastReasoner, createSimRoastTools(), ALLOW_POLICY);
  return runtime.runMission(mission, {
    maxIterations: 1,
    timeoutMs: 5_000,
    agentId: "sim-roast-runner"
  });
}

export { SIMULATE_ROAST_TOOL_NAME } from "./tools";
