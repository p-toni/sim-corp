import { AgentRuntime } from "@sim-corp/agent-runtime";
import type { PolicyChecker } from "@sim-corp/agent-runtime";
import type { AgentTrace, Mission, PolicyCheckRequest, PolicyCheckResult } from "@sim-corp/schemas";
import { roastReportReasoner } from "./agent";
import { createReportTools, type ReportToolsConfig } from "./tools";

const ALLOW_POLICY: PolicyChecker = {
  async check(request: PolicyCheckRequest): Promise<PolicyCheckResult> {
    return {
      request: { ...request, context: request.context ?? {} },
      decision: "ALLOW",
      checkedAt: new Date().toISOString(),
      violations: []
    };
  }
};

export async function runRoastReportMission(
  mission: Mission,
  toolsConfig: ReportToolsConfig = {}
): Promise<AgentTrace> {
  const runtime = new AgentRuntime(roastReportReasoner, createReportTools(toolsConfig), ALLOW_POLICY);
  return runtime.runMission(mission, {
    maxIterations: 1,
    timeoutMs: 10_000,
    agentId: "roast-report-agent"
  });
}

export * from "./tools";
export * from "./template";
