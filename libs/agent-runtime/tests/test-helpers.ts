import type {
  Mission,
  PolicyCheckRequest,
  PolicyCheckResult
} from "@sim-corp/schemas";
import type { PolicyChecker } from "../src/types";

const baseMission: Mission = {
  missionId: "mission-default",
  goal: { title: "Default mission" },
  constraints: [],
  context: {},
  priority: "MEDIUM"
};

export const createMission = (overrides: Partial<Mission> = {}): Mission => ({
  ...baseMission,
  ...overrides,
  goal: {
    ...baseMission.goal,
    ...(overrides.goal ?? {})
  },
  constraints: overrides.constraints ?? [...(baseMission.constraints ?? [])],
  context: overrides.context ?? { ...baseMission.context }
});

type PolicyDecisionFn = (req: PolicyCheckRequest) => PolicyCheckResult["decision"];

export const createPolicy = (decide: PolicyDecisionFn): PolicyChecker => ({
  async check(req) {
    const decision = decide(req);
    const result: PolicyCheckResult = {
      request: {
        ...req,
        context: req.context ?? {}
      },
      decision,
      checkedAt: new Date().toISOString(),
      violations: decision === "ALLOW" ? [] : ["denied"]
    };
    return result;
  }
});

export const createAllowPolicy = (
  spy?: (req: PolicyCheckRequest) => void
): PolicyChecker =>
  createPolicy((req) => {
    spy?.(req);
    return "ALLOW";
  });
