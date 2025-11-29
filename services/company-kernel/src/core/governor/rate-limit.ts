import Database from "better-sqlite3";
import type { RateLimitRule } from "./config";

export interface RateLimitResult {
  allowed: boolean;
  nextRetryAt?: string;
  tokens: number;
}

export class RateLimiter {
  constructor(private readonly db: Database.Database) {}

  take(scopeKey: string, goal: string, rule: RateLimitRule, nowIso: string = new Date().toISOString()): RateLimitResult {
    const bucketKey = `${scopeKey}|${goal}`;
    const row = this.db
      .prepare(`SELECT tokens, updated_at FROM rate_limit_buckets WHERE key = @key LIMIT 1`)
      .get({ key: bucketKey }) as { tokens: number; updated_at: string } | undefined;

    const nowMs = Date.parse(nowIso);
    const lastUpdatedMs = row ? Date.parse(row.updated_at) : undefined;
    const elapsedSeconds =
      typeof lastUpdatedMs === "number" && Number.isFinite(lastUpdatedMs) ? Math.max(0, (nowMs - lastUpdatedMs) / 1000) : 0;
    const refilled = row ? Math.min(rule.capacity, row.tokens + elapsedSeconds * rule.refillPerSec) : rule.capacity;

    const allowed = refilled >= 1;
    const remaining = allowed ? refilled - 1 : refilled;
    const updatedAt = nowIso;

    this.db
      .prepare(
        `INSERT INTO rate_limit_buckets (key, tokens, updated_at)
         VALUES (@key, @tokens, @updatedAt)
         ON CONFLICT(key) DO UPDATE SET tokens=excluded.tokens, updated_at=excluded.updated_at`
      )
      .run({ key: bucketKey, tokens: remaining, updatedAt });

    const refillRate = rule.refillPerSec <= 0 ? null : rule.refillPerSec;
    const secondsUntilToken =
      allowed || !refillRate ? null : Math.max(0, (1 - remaining) / refillRate);
    const nextRetryAt =
      secondsUntilToken === null ? undefined : new Date(nowMs + secondsUntilToken * 1000).toISOString();

    return { allowed, nextRetryAt, tokens: remaining };
  }
}
