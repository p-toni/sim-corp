import type { Database } from "@sim-corp/database";
import type { RateLimitRule } from "./config";

export interface RateLimitResult {
  allowed: boolean;
  nextRetryAt?: string;
  tokens: number;
}

export class RateLimiter {
  constructor(private readonly db: Database) {}

  async take(scopeKey: string, goal: string, rule: RateLimitRule, nowIso: string = new Date().toISOString()): Promise<RateLimitResult> {
    const bucketKey = `${scopeKey}|${goal}`;
    const result = await this.db.query<{ tokens: number; updated_at: string }>(
      `SELECT tokens, updated_at FROM rate_limit_buckets WHERE key = ? LIMIT 1`,
      [bucketKey]
    );
    const row = result.rows[0];

    const nowMs = Date.parse(nowIso);
    const lastUpdatedMs = row ? Date.parse(row.updated_at) : undefined;
    const elapsedSeconds =
      typeof lastUpdatedMs === "number" && Number.isFinite(lastUpdatedMs) ? Math.max(0, (nowMs - lastUpdatedMs) / 1000) : 0;
    const refilled = row ? Math.min(rule.capacity, row.tokens + elapsedSeconds * rule.refillPerSec) : rule.capacity;

    const allowed = refilled >= 1;
    const remaining = allowed ? refilled - 1 : refilled;
    const updatedAt = nowIso;

    await this.db.exec(
      `INSERT INTO rate_limit_buckets (key, tokens, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET tokens=excluded.tokens, updated_at=excluded.updated_at`,
      [bucketKey, remaining, updatedAt]
    );

    const refillRate = rule.refillPerSec <= 0 ? null : rule.refillPerSec;
    const secondsUntilToken =
      allowed || !refillRate ? null : Math.max(0, (1 - remaining) / refillRate);
    const nextRetryAt =
      secondsUntilToken === null ? undefined : new Date(nowMs + secondsUntilToken * 1000).toISOString();

    return { allowed, nextRetryAt, tokens: remaining };
  }
}
