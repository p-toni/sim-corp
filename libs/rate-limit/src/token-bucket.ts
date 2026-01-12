import type { IRateLimitStorage, TokenBucketConfig, TokenBucketState } from './interfaces';

/**
 * Token bucket rate limiter for smooth rate limiting.
 * Allows bursts up to capacity, then refills at a steady rate.
 *
 * Good for: APIs that should allow occasional bursts but maintain average rate
 */
export class TokenBucket {
  constructor(
    private readonly storage: IRateLimitStorage,
    private readonly config: TokenBucketConfig
  ) {}

  /**
   * Try to consume tokens from the bucket
   * @param key Unique identifier for the bucket
   * @param tokens Number of tokens to consume (default: 1)
   * @returns Whether tokens were successfully consumed
   */
  async consume(key: string, tokens: number = 1): Promise<{
    allowed: boolean;
    remaining: number;
    resetMs: number;
  }> {
    const state = await this.getState(key);
    const now = Date.now();

    // Refill tokens based on time elapsed
    const elapsedMs = now - state.lastRefill;
    const refillIntervals = Math.floor(elapsedMs / this.config.refillIntervalMs);

    if (refillIntervals > 0) {
      const tokensToAdd = refillIntervals * this.config.refillRate;
      state.tokens = Math.min(this.config.capacity, state.tokens + tokensToAdd);
      state.lastRefill = now;
    }

    // Try to consume tokens
    if (state.tokens >= tokens) {
      state.tokens -= tokens;
      await this.setState(key, state);

      // Calculate time until next refill
      const nextRefillMs = this.config.refillIntervalMs - (now - state.lastRefill);

      return {
        allowed: true,
        remaining: state.tokens,
        resetMs: nextRefillMs
      };
    }

    // Not enough tokens
    await this.setState(key, state);

    // Calculate time until enough tokens are available
    const tokensNeeded = tokens - state.tokens;
    const intervalsNeeded = Math.ceil(tokensNeeded / this.config.refillRate);
    const resetMs = intervalsNeeded * this.config.refillIntervalMs;

    return {
      allowed: false,
      remaining: state.tokens,
      resetMs
    };
  }

  /**
   * Get current bucket state
   */
  private async getState(key: string): Promise<TokenBucketState> {
    const stateKey = `${key}:state`;
    const count = await this.storage.get(stateKey);

    if (count === 0) {
      // New bucket - start with full capacity
      return {
        tokens: this.config.capacity,
        lastRefill: Date.now()
      };
    }

    // Decode state from stored number
    // Format: high 32 bits = tokens (scaled by 1000), low 32 bits = timestamp offset
    const tokens = Math.floor(count / 1000000);
    const timestampOffset = count % 1000000;
    const lastRefill = Date.now() - timestampOffset;

    return {
      tokens: Math.min(tokens, this.config.capacity),
      lastRefill
    };
  }

  /**
   * Save bucket state
   */
  private async setState(key: string, state: TokenBucketState): Promise<void> {
    const stateKey = `${key}:state`;

    // Encode state into a single number
    // Format: high bits = tokens (scaled by 1000), low bits = time offset from now
    const timestampOffset = Math.min(999999, Date.now() - state.lastRefill);
    const encoded = Math.floor(state.tokens) * 1000000 + timestampOffset;

    // Store with TTL of 2x refill interval (for cleanup)
    const ttl = this.config.refillIntervalMs * 2;

    // Use increment to store value (it creates key if doesn't exist)
    await this.storage.reset(stateKey);
    for (let i = 0; i < encoded; i++) {
      await this.storage.increment(stateKey, ttl);
    }
  }

  /**
   * Reset bucket for a key
   */
  async reset(key: string): Promise<void> {
    await this.storage.reset(`${key}:state`);
  }
}
