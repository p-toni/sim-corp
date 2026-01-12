import type { IRateLimitStorage, RateLimitConfig, RateLimitResult, RateLimitInfo, RateLimitMetrics } from './interfaces';

/**
 * Core rate limiter implementing sliding window algorithm.
 * Can be used with any storage backend (memory, Redis, etc.)
 */
export class RateLimiter {
  private metrics: RateLimitMetrics = {
    totalRequests: 0,
    allowedRequests: 0,
    blockedRequests: 0,
    activeKeys: 0
  };

  constructor(
    private readonly storage: IRateLimitStorage,
    private readonly defaultConfig: RateLimitConfig
  ) {}

  /**
   * Check if request should be allowed
   */
  async check(key: string, config?: Partial<RateLimitConfig>): Promise<RateLimitResult> {
    const finalConfig = { ...this.defaultConfig, ...config };

    // Update metrics
    this.metrics.totalRequests++;

    // Check if should skip rate limiting
    if (finalConfig.skip && await finalConfig.skip(key)) {
      this.metrics.allowedRequests++;
      return {
        allowed: true,
        info: {
          current: 0,
          limit: finalConfig.maxRequests,
          remaining: finalConfig.maxRequests,
          resetMs: finalConfig.windowMs,
          resetAt: new Date(Date.now() + finalConfig.windowMs),
          exceeded: false
        }
      };
    }

    // Increment counter
    const current = await this.storage.increment(key, finalConfig.windowMs);
    const ttl = await this.storage.ttl(key);

    // Calculate rate limit info
    const exceeded = current > finalConfig.maxRequests;
    const remaining = Math.max(0, finalConfig.maxRequests - current);
    const resetMs = ttl > 0 ? ttl : finalConfig.windowMs;
    const resetAt = new Date(Date.now() + resetMs);

    const info: RateLimitInfo = {
      current,
      limit: finalConfig.maxRequests,
      remaining,
      resetMs,
      resetAt,
      exceeded
    };

    const result: RateLimitResult = {
      allowed: !exceeded,
      info
    };

    // Update metrics
    if (exceeded) {
      this.metrics.blockedRequests++;

      // Call onLimitReached handler if provided
      if (finalConfig.onLimitReached) {
        await finalConfig.onLimitReached(key, info);
      }
    } else {
      this.metrics.allowedRequests++;
    }

    return result;
  }

  /**
   * Reset rate limit for a specific key
   */
  async reset(key: string): Promise<void> {
    await this.storage.reset(key);
  }

  /**
   * Get current count for a key
   */
  async getCount(key: string): Promise<number> {
    return this.storage.get(key);
  }

  /**
   * Get metrics for monitoring
   */
  async getMetrics(): Promise<RateLimitMetrics> {
    // Update active keys count if storage supports it
    if (this.storage.keys) {
      const keys = await this.storage.keys();
      this.metrics.activeKeys = keys.length;

      // Get top keys by count
      const keyCounts = await Promise.all(
        keys.map(async (key) => ({
          key,
          count: await this.storage.get(key)
        }))
      );

      // Sort by count descending and take top 10
      this.metrics.topKeys = keyCounts
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    }

    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      allowedRequests: 0,
      blockedRequests: 0,
      activeKeys: 0
    };
  }
}
