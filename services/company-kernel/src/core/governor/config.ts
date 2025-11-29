import Database from "better-sqlite3";
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

export const GovernorConfigSchema = z.object({
  rateLimits: z.record(RateLimitRuleSchema).default({}),
  gates: z.record(ReportGateConfigSchema).default({}),
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
  policy: {
    allowedGoals: ["generate-roast-report"]
  }
};

export class GovernorConfigStore {
  constructor(private readonly db: Database.Database) {}

  getConfig(): GovernorConfig {
    const row = this.db.prepare(`SELECT value_json FROM kernel_settings WHERE key = @key LIMIT 1`).get({ key: "governor_config" }) as
      | { value_json: string }
      | undefined;
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

  setConfig(config: GovernorConfig): GovernorConfig {
    const parsed = GovernorConfigSchema.parse(config);
    const merged = withDefaults(parsed);
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO kernel_settings (key, value_json, updated_at)
         VALUES (@key, @valueJson, @updatedAt)
         ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at`
      )
      .run({
        key: "governor_config",
        valueJson: JSON.stringify(merged),
        updatedAt: now
      });
    return merged;
  }
}

function withDefaults(config: GovernorConfig): GovernorConfig {
  return {
    rateLimits: { ...DEFAULT_GOVERNOR_CONFIG.rateLimits, ...config.rateLimits },
    gates: { ...DEFAULT_GOVERNOR_CONFIG.gates, ...config.gates },
    policy: { ...DEFAULT_GOVERNOR_CONFIG.policy, ...config.policy }
  };
}
