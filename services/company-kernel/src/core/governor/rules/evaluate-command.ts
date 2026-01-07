import type { GovernanceDecision } from "@sim-corp/schemas";
import type { CommandAutonomyConfig, AutonomyLevel } from "../config";

export interface CommandProposal {
  commandType: string;
  targetValue?: number;
  machineId?: string;
  sessionId?: string;
  actor?: {
    kind: string;
    id: string;
  };
}

export interface CommandEvaluationContext {
  proposal: CommandProposal;
  config: CommandAutonomyConfig;
  recentFailureRate?: number; // failure rate in evaluation window
  commandsInSession?: number; // commands already proposed in this session
}

/**
 * Evaluate a command proposal against Governor autonomy config
 */
export function evaluateCommandProposal(
  ctx: CommandEvaluationContext,
  nowIso: string
): GovernanceDecision {
  const { proposal, config, recentFailureRate, commandsInSession } = ctx;

  // Check autonomy level
  const autonomyDecision = checkAutonomyLevel(config.autonomyLevel, proposal, nowIso);
  if (autonomyDecision.action !== "ALLOW") {
    return autonomyDecision;
  }

  // Start with reasons from autonomy decision
  const reasons: GovernanceDecision["reasons"] = [...(autonomyDecision.reasons || [])];

  // Check failure rate threshold
  if (recentFailureRate !== undefined && recentFailureRate > config.commandFailureThreshold) {
    return {
      action: "BLOCK",
      confidence: "HIGH",
      reasons: [
        {
          code: "HIGH_FAILURE_RATE",
          message: `Command failure rate (${(recentFailureRate * 100).toFixed(1)}%) exceeds threshold (${(config.commandFailureThreshold * 100).toFixed(1)}%)`,
          details: { recentFailureRate, threshold: config.commandFailureThreshold }
        }
      ],
      decidedAt: nowIso,
      decidedBy: "KERNEL_GOVERNOR"
    };
  }

  // Check session command limit
  if (
    config.maxCommandsPerSession !== undefined &&
    commandsInSession !== undefined &&
    commandsInSession >= config.maxCommandsPerSession
  ) {
    return {
      action: "BLOCK",
      confidence: "MED",
      reasons: [
        {
          code: "SESSION_COMMAND_LIMIT",
          message: `Session has reached command limit (${config.maxCommandsPerSession})`,
          details: { commandsInSession, limit: config.maxCommandsPerSession }
        }
      ],
      decidedAt: nowIso,
      decidedBy: "KERNEL_GOVERNOR"
    };
  }

  // Add informational reasons based on config
  if (config.requireApprovalForAll) {
    reasons.push({
      code: "APPROVAL_REQUIRED",
      message: "All commands require explicit approval (L3 autonomy)",
      details: { autonomyLevel: config.autonomyLevel }
    });
  }

  return {
    action: "ALLOW",
    confidence: "HIGH",
    reasons,
    decidedAt: nowIso,
    decidedBy: "KERNEL_GOVERNOR"
  };
}

/**
 * Check if autonomy level allows command execution
 */
function checkAutonomyLevel(
  level: AutonomyLevel,
  proposal: CommandProposal,
  nowIso: string
): GovernanceDecision {
  switch (level) {
    case "L1":
      // L1: Assist only - no commands allowed
      return {
        action: "BLOCK",
        confidence: "HIGH",
        reasons: [
          {
            code: "AUTONOMY_LEVEL_TOO_LOW",
            message: "L1 autonomy does not allow command execution",
            details: { autonomyLevel: "L1" }
          }
        ],
        decidedAt: nowIso,
        decidedBy: "KERNEL_GOVERNOR"
      };

    case "L2":
      // L2: Recommend only - commands should be manual
      // For now, block agent commands but allow manual commands
      if (proposal.actor?.kind === "AGENT") {
        return {
          action: "BLOCK",
          confidence: "HIGH",
          reasons: [
            {
              code: "AGENT_COMMANDS_NOT_ALLOWED",
              message: "L2 autonomy does not allow agent-proposed commands",
              details: { autonomyLevel: "L2", actorKind: proposal.actor.kind }
            }
          ],
          decidedAt: nowIso,
          decidedBy: "KERNEL_GOVERNOR"
        };
      }
      return {
        action: "ALLOW",
        confidence: "MED",
        reasons: [
          {
            code: "MANUAL_COMMAND_ALLOWED",
            message: "L2 allows manual commands",
            details: { autonomyLevel: "L2" }
          }
        ],
        decidedAt: nowIso,
        decidedBy: "KERNEL_GOVERNOR"
      };

    case "L3":
      // L3: Act with explicit approval (HITL) - all commands allowed but require approval
      return {
        action: "ALLOW",
        confidence: "HIGH",
        reasons: [
          {
            code: "APPROVAL_REQUIRED",
            message: "L3 allows commands with explicit approval",
            details: { autonomyLevel: "L3" }
          }
        ],
        decidedAt: nowIso,
        decidedBy: "KERNEL_GOVERNOR"
      };

    case "L4":
    case "L5":
      // L4/L5: Higher autonomy levels (future work)
      // For now, treat as L3
      return {
        action: "ALLOW",
        confidence: "MED",
        reasons: [
          {
            code: "HIGH_AUTONOMY_LEVEL",
            message: `${level} autonomy (treated as L3 for now)`,
            details: { autonomyLevel: level }
          }
        ],
        decidedAt: nowIso,
        decidedBy: "KERNEL_GOVERNOR"
      };

    default:
      return {
        action: "BLOCK",
        confidence: "LOW",
        reasons: [
          {
            code: "UNKNOWN_AUTONOMY_LEVEL",
            message: "Unknown autonomy level",
            details: { autonomyLevel: level }
          }
        ],
        decidedAt: nowIso,
        decidedBy: "KERNEL_GOVERNOR"
      };
  }
}
