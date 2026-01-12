/**
 * Cache factory - creates cache instance based on configuration
 */
import type { ICache, CacheFactoryConfig } from './interfaces.js';
import { MemoryCache } from './memory-cache.js';
import { RedisCache } from './redis-cache.js';

/**
 * Create a cache instance based on configuration
 *
 * @param config - Cache configuration
 * @returns Cache instance
 *
 * @example
 * ```typescript
 * // Memory cache (development)
 * const cache = createCache({
 *   backend: 'memory',
 *   ttl: 300,
 *   prefix: 'myapp',
 *   memory: {
 *     maxEntries: 1000,
 *     cleanupIntervalMs: 60000,
 *   },
 * });
 *
 * // Redis cache (production)
 * const cache = createCache({
 *   backend: 'redis',
 *   ttl: 300,
 *   prefix: 'myapp',
 *   redis: {
 *     url: 'redis://localhost:6379',
 *   },
 * });
 * ```
 */
export function createCache(config: CacheFactoryConfig): ICache {
  if (config.backend === 'memory') {
    return new MemoryCache(config);
  } else if (config.backend === 'redis') {
    return new RedisCache(config);
  } else {
    throw new Error(`Unsupported cache backend: ${config.backend}`);
  }
}

/**
 * Create a cache from environment variables
 *
 * Environment variables:
 * - CACHE_BACKEND: 'memory' or 'redis' (default: 'memory')
 * - CACHE_TTL: Default TTL in seconds (default: 300)
 * - CACHE_PREFIX: Key prefix (optional)
 * - REDIS_URL: Redis connection URL (required for redis backend)
 * - REDIS_HOST: Redis host (alternative to REDIS_URL)
 * - REDIS_PORT: Redis port (default: 6379)
 * - REDIS_PASSWORD: Redis password (optional)
 * - REDIS_DB: Redis database number (default: 0)
 * - CACHE_MEMORY_MAX_ENTRIES: Max entries for memory cache (default: 1000)
 * - CACHE_MEMORY_CLEANUP_INTERVAL: Cleanup interval in ms (default: 60000)
 *
 * @returns Cache instance
 */
export function createCacheFromEnv(): ICache {
  const backend = (process.env.CACHE_BACKEND as 'memory' | 'redis') ?? 'memory';
  const ttl = process.env.CACHE_TTL ? Number.parseInt(process.env.CACHE_TTL, 10) : 300;
  const prefix = process.env.CACHE_PREFIX;

  const config: CacheFactoryConfig = {
    backend,
    ttl,
    prefix,
  };

  if (backend === 'memory') {
    config.memory = {
      maxEntries: process.env.CACHE_MEMORY_MAX_ENTRIES
        ? Number.parseInt(process.env.CACHE_MEMORY_MAX_ENTRIES, 10)
        : 1000,
      cleanupIntervalMs: process.env.CACHE_MEMORY_CLEANUP_INTERVAL
        ? Number.parseInt(process.env.CACHE_MEMORY_CLEANUP_INTERVAL, 10)
        : 60000,
    };
  } else if (backend === 'redis') {
    config.redis = {
      url: process.env.REDIS_URL,
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT ? Number.parseInt(process.env.REDIS_PORT, 10) : 6379,
      password: process.env.REDIS_PASSWORD,
      db: process.env.REDIS_DB ? Number.parseInt(process.env.REDIS_DB, 10) : 0,
    };
  }

  return createCache(config);
}

/**
 * Singleton cache instance
 */
let _instance: ICache | null = null;

/**
 * Get singleton cache instance (creates from env if not exists)
 */
export function getCacheInstance(): ICache {
  if (!_instance) {
    _instance = createCacheFromEnv();
  }
  return _instance;
}

/**
 * Reset singleton instance (for testing)
 */
export function resetCacheInstance(): void {
  if (_instance) {
    void _instance.close();
    _instance = null;
  }
}
