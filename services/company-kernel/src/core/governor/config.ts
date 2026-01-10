import type { Database } from "@sim-corp/database";
import { z } from "zod";

export const RateLimitRuleSchema = z.object({
  capacity: z.number().positive(),
  refillPerSec: z.number().nonnegative()
});
export type RateLimitRule = z.infer<typeof RateLimitRuleSchema>;

export const ReportGateConfigSchema = z.object({
  minTelemetryPoints: z.number().nonnegative(),
  minDurationSec: z.number().nonnegative(),
  requireBTorET: z.boolean(),
  quarantineOnMissingSignals: z.boolean(),
  quarantineOnSilenceClose: z.boolean()
});
export type ReportGateConfig = z.infer<typeof ReportGateConfigSchema>;

export const AutonomyLevelSchema = z.enum(["L1", "L2", "L3", "L4", "L5"]);
export type AutonomyLevel = z.infer<typeof AutonomyLevelSchema>;

export const CommandAutonomyConfigSchema = z.object({
  autonomyLevel: AutonomyLevelSchema.default("L3"),
  requireApprovalForAll: z.boolean().default(true),
  maxCommandsPerSession: z.number().int().positive().optional(),
  commandFailureThreshold: z.number().min(0).max(1).default(0.3), // downgrade if >30% failure rate
  evaluationWindowMinutes: z.number().int().positive().default(60)
});
export type CommandAutonomyConfig = z.infer<typeof CommandAutonomyConfigSchema>;

export const GovernorConfigSchema = z.object({
  rateLimits: z.record(RateLimitRuleSchema).default({}),
  gates: z.record(ReportGateConfigSchema).default({}),
  commandAutonomy: CommandAutonomyConfigSchema.default({
    autonomyLevel: "L3",
    requireApprovalForAll: true,
    commandFailureThreshold: 0.3,
    evaluationWindowMinutes: 60
  }),
  policy: z
    .object({
      allowedGoals: z.array(z.string()).default([])
    })
    .default({ allowedGoals: [] })
});

export type GovernorConfig = z.infer<typeof GovernorConfigSchema>;

export const DEFAULT_GOVERNOR_CONFIG: GovernorConfig = {
  rateLimits: {
    "generate-roast-report": { capacity: 10, refillPerSec: 10 / 3600 }
  },
  gates: {
    "generate-roast-report": {
      minTelemetryPoints: 60,
      minDurationSec: 90,
      requireBTorET: true,
      quarantineOnMissingSignals: true,
      quarantineOnSilenceClose: true
    }
  },
  commandAutonomy: {
    autonomyLevel: "L3",
    requireApprovalForAll: true,
    commandFailureThreshold: 0.3,
    evaluationWindowMinutes: 60
  },
  policy: {
    allowedGoals: ["generate-roast-report"]
  }
};

export class GovernorConfigStore {
  constructor(private readonly db: Database) {}

  async getConfig(): Promise<GovernorConfig> {
    const result = await this.db.query<{ value_json: string }>(
      `SELECT value_json FROM kernel_settings WHERE key = ? LIMIT 1`,
      ["governor_config"]
    );
    const row = result.rows[0];
    if (!row) {
      return DEFAULT_GOVERNOR_CONFIG;
    }
    try {
      const parsed = GovernorConfigSchema.parse(JSON.parse(row.value_json));
      return withDefaults(parsed);
    } catch {
      return DEFAULT_GOVERNOR_CONFIG;
    }
  }

  async setConfig(config: GovernorConfig): Promise<GovernorConfig> {
    const parsed = GovernorConfigSchema.parse(config);
    const merged = withDefaults(parsed);
    const now = new Date().toISOString();
    await this.db.exec(
      `INSERT INTO kernel_settings (key, value_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at`,
      ["governor_config", JSON.stringify(merged), now]
    );
    return merged;
  }
}

function withDefaults(config: GovernorConfig): GovernorConfig {
  return {
    rateLimits: { ...DEFAULT_GOVERNOR_CONFIG.rateLimits, ...config.rateLimits },
    gates: { ...DEFAULT_GOVERNOR_CONFIG.gates, ...config.gates },
    commandAutonomy: { ...DEFAULT_GOVERNOR_CONFIG.commandAutonomy, ...config.commandAutonomy },
    policy: { ...DEFAULT_GOVERNOR_CONFIG.policy, ...config.policy }
  };
}
