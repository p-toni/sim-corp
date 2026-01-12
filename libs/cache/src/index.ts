/**
 * @sim-corp/cache - Caching library
 *
 * Provides unified caching interface with multiple backends:
 * - Memory cache for development (LRU eviction, TTL expiration)
 * - Redis cache for production (distributed, persistent)
 *
 * Features:
 * - Cache-aside pattern helpers
 * - Batch operations
 * - Cache warming
 * - Tag-based invalidation
 * - Comprehensive metrics
 *
 * @example
 * ```typescript
 * import { createCacheFromEnv, cacheAside } from '@sim-corp/cache';
 *
 * // Create cache from environment
 * const cache = createCacheFromEnv();
 *
 * // Cache-aside pattern
 * const user = await cacheAside(cache, {
 *   key: `user:${userId}`,
 *   fetch: async () => await db.getUser(userId),
 *   ttl: 3600,
 * });
 *
 * // Manual operations
 * await cache.set('key', value, 300);
 * const value = await cache.get('key');
 * await cache.del('key');
 *
 * // Statistics
 * const stats = await cache.stats();
 * console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(2)}%`);
 * ```
 */

// Core interfaces
export type {
  CacheBackend,
  CacheConfig,
  CacheEntry,
  CacheStats,
  ICache,
  CacheAsideOptions,
  InvalidationStrategy,
  CacheFactoryConfig,
} from './interfaces.js';

// Cache implementations
export { MemoryCache } from './memory-cache.js';
export { RedisCache } from './redis-cache.js';

// Factory
export {
  createCache,
  createCacheFromEnv,
  getCacheInstance,
  resetCacheInstance,
} from './factory.js';

// Cache-aside pattern helpers
export {
  cacheAside,
  cachedFunction,
  batchGet,
  batchSet,
  warmCache,
  invalidateByTag,
} from './cache-aside.js';
