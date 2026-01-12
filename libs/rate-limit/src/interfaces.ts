/**
 * Rate limiting and throttling interfaces
 */

export interface RateLimitConfig {
  /** Maximum number of requests allowed */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Optional message for rate limit exceeded responses */
  message?: string;
  /** Optional status code (default: 429) */
  statusCode?: number;
  /** Skip rate limiting for certain conditions */
  skip?: (key: string) => boolean | Promise<boolean>;
  /** Custom key generator */
  keyGenerator?: (context: any) => string | Promise<string>;
  /** Handler called when rate limit is exceeded */
  onLimitReached?: (key: string, limit: RateLimitInfo) => void | Promise<void>;
}

export interface RateLimitInfo {
  /** Current number of requests in window */
  current: number;
  /** Maximum requests allowed */
  limit: number;
  /** Remaining requests in current window */
  remaining: number;
  /** Time until window resets (milliseconds) */
  resetMs: number;
  /** Timestamp when window resets */
  resetAt: Date;
  /** Whether limit has been exceeded */
  exceeded: boolean;
}

export interface RateLimitResult {
  /** Whether request should be allowed */
  allowed: boolean;
  /** Rate limit information */
  info: RateLimitInfo;
}

export interface IRateLimitStorage {
  /**
   * Increment counter for a key
   * @returns Current count after increment
   */
  increment(key: string, windowMs: number): Promise<number>;

  /**
   * Get current count for a key
   */
  get(key: string): Promise<number>;

  /**
   * Get time until key expires (milliseconds)
   */
  ttl(key: string): Promise<number>;

  /**
   * Reset counter for a key
   */
  reset(key: string): Promise<void>;

  /**
   * Get all keys (for monitoring/debugging)
   */
  keys?(): Promise<string[]>;
}

export interface TokenBucketConfig {
  /** Maximum tokens in bucket */
  capacity: number;
  /** Tokens added per refill interval */
  refillRate: number;
  /** Refill interval in milliseconds */
  refillIntervalMs: number;
}

export interface TokenBucketState {
  /** Current tokens available */
  tokens: number;
  /** Last refill timestamp */
  lastRefill: number;
}

export interface RateLimitStrategy {
  /** Strategy name (for metrics/logging) */
  name: string;
  /** Generate rate limit key from context */
  getKey(context: any): string | Promise<string>;
  /** Get rate limit config for this request */
  getConfig(context: any): RateLimitConfig | Promise<RateLimitConfig>;
}

export interface RateLimitMetrics {
  /** Total requests processed */
  totalRequests: number;
  /** Requests allowed */
  allowedRequests: number;
  /** Requests blocked (rate limited) */
  blockedRequests: number;
  /** Current unique keys tracked */
  activeKeys: number;
  /** Requests by key (top N) */
  topKeys?: Array<{ key: string; count: number }>;
}
