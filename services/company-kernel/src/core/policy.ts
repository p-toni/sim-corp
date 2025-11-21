import type { PolicyCheckRequest, PolicyCheckResult } from "@sim-corp/schemas";
import { PolicyCheckResultSchema } from "@sim-corp/schemas";
import { Registry } from "./registry";

export class PolicyEngine {
  constructor(private readonly registry: Registry) {}

  async check(req: PolicyCheckRequest): Promise<PolicyCheckResult> {
    const tool = this.registry.getTool(req.tool);
    const isRestricted = tool?.policyTags?.includes("restricted") ?? false;
    const overrideRequested = Boolean(req.context?.override);

    const decision = !isRestricted || overrideRequested ? "ALLOW" : "DENY";
    const reason = decision === "DENY" ? "Tool is restricted without override" : undefined;
    const violations = decision === "DENY" ? ["restricted-tool"] : [];

    return PolicyCheckResultSchema.parse({
      request: req,
      decision,
      reason,
      checkedAt: new Date().toISOString(),
      evaluatorId: "policy-engine",
      violations
    });
  }
}
