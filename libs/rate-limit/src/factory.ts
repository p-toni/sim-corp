import { RateLimiter } from './rate-limiter';
import { MemoryStorage } from './memory-storage';
import { RedisStorage } from './redis-storage';
import { IpRateLimitStrategy, UserRateLimitStrategy, OrgRateLimitStrategy } from './strategies';
import type { IRateLimitStorage, RateLimitConfig, RateLimitStrategy } from './interfaces';

/**
 * Factory for creating rate limiters and strategies
 */
export class RateLimitFactory {
  /**
   * Create storage backend from environment variables
   */
  static createStorage(): IRateLimitStorage {
    const storageType = process.env.RATE_LIMIT_STORAGE ?? 'memory';

    if (storageType === 'redis') {
      const redisUrl = process.env.REDIS_URL;
      const redisHost = process.env.REDIS_HOST ?? 'localhost';
      const redisPort = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379;
      const redisPassword = process.env.REDIS_PASSWORD;

      return new RedisStorage({
        url: redisUrl,
        host: redisHost,
        port: redisPort,
        password: redisPassword,
        keyPrefix: 'ratelimit:'
      });
    }

    // Default to memory storage
    return new MemoryStorage({
      cleanupIntervalMs: 60000 // 1 minute
    });
  }

  /**
   * Create rate limiter from environment variables
   */
  static createRateLimiter(storage?: IRateLimitStorage): RateLimiter {
    const maxRequests = process.env.RATE_LIMIT_MAX_REQUESTS
      ? parseInt(process.env.RATE_LIMIT_MAX_REQUESTS)
      : 100;

    const windowMs = process.env.RATE_LIMIT_WINDOW_MS
      ? parseInt(process.env.RATE_LIMIT_WINDOW_MS)
      : 60000; // 1 minute

    const config: RateLimitConfig = {
      maxRequests,
      windowMs,
      message: process.env.RATE_LIMIT_MESSAGE ?? 'Too many requests, please try again later.',
      statusCode: process.env.RATE_LIMIT_STATUS_CODE
        ? parseInt(process.env.RATE_LIMIT_STATUS_CODE)
        : 429
    };

    const finalStorage = storage ?? RateLimitFactory.createStorage();

    return new RateLimiter(finalStorage, config);
  }

  /**
   * Create rate limit strategy from environment variables
   */
  static createStrategy(rateLimiter: RateLimiter): RateLimitStrategy {
    const strategyType = process.env.RATE_LIMIT_STRATEGY ?? 'ip';
    const config = rateLimiter['defaultConfig']; // Access private field via indexer

    switch (strategyType) {
      case 'user':
        return new UserRateLimitStrategy(config);

      case 'org':
        return new OrgRateLimitStrategy(config);

      case 'ip':
      default:
        return new IpRateLimitStrategy(config);
    }
  }

  /**
   * Create complete rate limiting setup from environment
   */
  static createFromEnv(): {
    storage: IRateLimitStorage;
    rateLimiter: RateLimiter;
    strategy: RateLimitStrategy;
  } {
    const storage = RateLimitFactory.createStorage();
    const rateLimiter = RateLimitFactory.createRateLimiter(storage);
    const strategy = RateLimitFactory.createStrategy(rateLimiter);

    return { storage, rateLimiter, strategy };
  }

  /**
   * Singleton instance
   */
  private static _instance: {
    storage: IRateLimitStorage;
    rateLimiter: RateLimiter;
    strategy: RateLimitStrategy;
  } | null = null;

  static getInstance(): {
    storage: IRateLimitStorage;
    rateLimiter: RateLimiter;
    strategy: RateLimitStrategy;
  } {
    if (!RateLimitFactory._instance) {
      RateLimitFactory._instance = RateLimitFactory.createFromEnv();
    }
    return RateLimitFactory._instance;
  }

  static resetInstance(): void {
    RateLimitFactory._instance = null;
  }
}
