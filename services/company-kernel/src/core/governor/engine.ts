import type { GovernanceDecision, Mission } from "@sim-corp/schemas";
import type { MissionStatus } from "../../db/repo";
import { GovernorConfigStore, type GovernorConfig, DEFAULT_GOVERNOR_CONFIG } from "./config";
import { RateLimiter } from "./rate-limit";
import { evaluateReportMission } from "./rules/report-mission";
import { evaluateCommandProposal, type CommandProposal, type CommandEvaluationContext } from "./rules/evaluate-command";

export interface GovernorResult {
  decision: GovernanceDecision;
  status: MissionStatus;
  nextRetryAt?: string;
}

export type { CommandProposal } from "./rules/evaluate-command";

export class GovernorEngine {
  constructor(
    private readonly configStore: GovernorConfigStore,
    private readonly rateLimiter: RateLimiter
  ) {}

  async evaluateMission(mission: Mission, now: Date = new Date()): Promise<GovernorResult> {
    const nowIso = now.toISOString();
    const config = await this.configStore.getConfig() ?? DEFAULT_GOVERNOR_CONFIG;
    const goal = this.normalizeGoal(mission.goal);

    if (!config.policy.allowedGoals.includes(goal)) {
      const decision: GovernanceDecision = {
        action: "BLOCK",
        confidence: "LOW",
        reasons: [
          {
            code: "GOAL_NOT_ALLOWED",
            message: `Goal ${goal} is not allowed by policy`,
            details: { goal }
          }
        ],
        decidedAt: nowIso,
        decidedBy: "KERNEL_GOVERNOR"
      };
      return { decision, status: "BLOCKED" };
    }

    const gateDecision = this.applyGate(goal, mission, config, nowIso);
    if (gateDecision.action === "BLOCK") {
      return { decision: gateDecision, status: "BLOCKED" };
    }
    if (gateDecision.action === "QUARANTINE") {
      return { decision: gateDecision, status: "QUARANTINED" };
    }
    if (gateDecision.action === "RETRY_LATER") {
      const nextRetryAt = gateDecision.reasons[0]?.details?.nextRetryAt;
      return { decision: gateDecision, status: "RETRY", nextRetryAt: typeof nextRetryAt === "string" ? nextRetryAt : undefined };
    }

    const rateRule = config.rateLimits[goal];
    if (rateRule) {
      const scopeKey = this.buildScopeKey(mission);
      const rate = await this.rateLimiter.take(scopeKey, goal, rateRule, nowIso);
      if (!rate.allowed) {
        const decision: GovernanceDecision = {
          action: "RETRY_LATER",
          confidence: gateDecision.confidence ?? "LOW",
          reasons: [
            {
              code: "RATE_LIMITED",
              message: "Mission rate limited",
              details: { scopeKey, goal, nextRetryAt: rate.nextRetryAt }
            }
          ],
          decidedAt: nowIso,
          decidedBy: "KERNEL_GOVERNOR"
        };
        return { decision, status: "RETRY", nextRetryAt: rate.nextRetryAt };
      }
    }

    return { decision: gateDecision, status: "PENDING" };
  }

  /**
   * Evaluate a command proposal against Governor autonomy config
   */
  async evaluateCommand(
    proposal: CommandProposal,
    context: {
      recentFailureRate?: number;
      commandsInSession?: number;
    } = {},
    now: Date = new Date()
  ): Promise<GovernanceDecision> {
    const nowIso = now.toISOString();
    const config = await this.configStore.getConfig() ?? DEFAULT_GOVERNOR_CONFIG;

    const evalContext: CommandEvaluationContext = {
      proposal,
      config: config.commandAutonomy,
      recentFailureRate: context.recentFailureRate,
      commandsInSession: context.commandsInSession
    };

    return evaluateCommandProposal(evalContext, nowIso);
  }

  private applyGate(goal: string, mission: Mission, config: GovernorConfig, nowIso: string): GovernanceDecision {
    if (goal === "generate-roast-report") {
      const gate = config.gates[goal] ?? DEFAULT_GOVERNOR_CONFIG.gates[goal];
      if (gate) {
        return evaluateReportMission(mission, gate, nowIso);
      }
    }

    return {
      action: "ALLOW",
      confidence: "MED",
      reasons: [],
      decidedAt: nowIso,
      decidedBy: "KERNEL_GOVERNOR"
    };
  }

  private buildScopeKey(mission: Mission): string {
    const ctx = (mission as { context?: Record<string, unknown> }).context ?? {};
    const orgId = (ctx as { orgId?: string }).orgId ?? "unknown-org";
    const siteId = (ctx as { siteId?: string }).siteId ?? "unknown-site";
    const machineId = (ctx as { machineId?: string }).machineId ?? "unknown-machine";
    return `${orgId}/${siteId}/${machineId}`;
  }

  private normalizeGoal(goal: Mission["goal"]): string {
    if (typeof goal === "string") return goal;
    if (goal && typeof goal === "object" && "title" in goal) {
      return (goal as { title: string }).title;
    }
    return "unknown";
  }
}
