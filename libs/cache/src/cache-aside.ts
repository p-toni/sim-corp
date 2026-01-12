/**
 * Cache-aside pattern helper
 * Automatically fetches and caches data on cache miss
 */
import type { ICache, CacheAsideOptions } from './interfaces.js';

/**
 * Cache-aside pattern implementation
 *
 * @param cache - Cache instance
 * @param options - Cache-aside options
 * @returns Cached or fetched value
 *
 * @example
 * ```typescript
 * const user = await cacheAside(cache, {
 *   key: `user:${userId}`,
 *   fetch: async () => {
 *     return await db.query('SELECT * FROM users WHERE id = ?', [userId]);
 *   },
 *   ttl: 3600, // 1 hour
 * });
 * ```
 */
export async function cacheAside<T>(
  cache: ICache,
  options: CacheAsideOptions<T>
): Promise<T> {
  const { key, fetch, ttl, refreshOnExpire = true } = options;

  // Try to get from cache
  const cached = await cache.get<T>(key);

  if (cached !== null) {
    return cached;
  }

  // Cache miss - fetch data
  const data = await fetch();

  // Store in cache
  if (refreshOnExpire || cached === null) {
    await cache.set(key, data, ttl);
  }

  return data;
}

/**
 * Cached function wrapper
 * Wraps a function to automatically cache its results
 *
 * @param cache - Cache instance
 * @param keyGenerator - Function to generate cache key from arguments
 * @param fn - Function to wrap
 * @param ttl - Optional TTL in seconds
 * @returns Wrapped function
 *
 * @example
 * ```typescript
 * const getUserById = cachedFunction(
 *   cache,
 *   (userId: string) => `user:${userId}`,
 *   async (userId: string) => {
 *     return await db.query('SELECT * FROM users WHERE id = ?', [userId]);
 *   },
 *   3600
 * );
 *
 * // First call fetches from database and caches
 * const user1 = await getUserById('user123');
 *
 * // Second call returns from cache
 * const user2 = await getUserById('user123');
 * ```
 */
export function cachedFunction<TArgs extends unknown[], TReturn>(
  cache: ICache,
  keyGenerator: (...args: TArgs) => string,
  fn: (...args: TArgs) => Promise<TReturn>,
  ttl?: number
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs): Promise<TReturn> => {
    const key = keyGenerator(...args);

    return cacheAside(cache, {
      key,
      fetch: () => fn(...args),
      ttl,
    });
  };
}

/**
 * Batch cache operations helper
 * Efficiently fetch multiple keys at once
 *
 * @param cache - Cache instance
 * @param keys - Array of cache keys to fetch
 * @returns Map of key to value (only includes found keys)
 *
 * @example
 * ```typescript
 * const userIds = ['user1', 'user2', 'user3'];
 * const cacheKeys = userIds.map(id => `user:${id}`);
 * const cached = await batchGet(cache, cacheKeys);
 *
 * // Get missing IDs
 * const missingIds = userIds.filter((id, i) => !cached.has(cacheKeys[i]));
 *
 * // Fetch missing from database
 * const users = await fetchUsersFromDb(missingIds);
 *
 * // Cache the fetched users
 * for (const user of users) {
 *   await cache.set(`user:${user.id}`, user, 3600);
 * }
 * ```
 */
export async function batchGet<T>(
  cache: ICache,
  keys: string[]
): Promise<Map<string, T>> {
  const result = new Map<string, T>();

  await Promise.all(
    keys.map(async (key) => {
      const value = await cache.get<T>(key);
      if (value !== null) {
        result.set(key, value);
      }
    })
  );

  return result;
}

/**
 * Batch set cache entries
 *
 * @param cache - Cache instance
 * @param entries - Array of {key, value} to cache
 * @param ttl - Optional TTL in seconds
 *
 * @example
 * ```typescript
 * await batchSet(cache, [
 *   { key: 'user:1', value: user1 },
 *   { key: 'user:2', value: user2 },
 *   { key: 'user:3', value: user3 },
 * ], 3600);
 * ```
 */
export async function batchSet<T>(
  cache: ICache,
  entries: Array<{ key: string; value: T }>,
  ttl?: number
): Promise<void> {
  await Promise.all(
    entries.map(({ key, value }) => cache.set(key, value, ttl))
  );
}

/**
 * Cache warming helper
 * Pre-populate cache with data
 *
 * @param cache - Cache instance
 * @param data - Array of {key, value} to warm
 * @param ttl - Optional TTL in seconds
 *
 * @example
 * ```typescript
 * // Warm cache with frequently accessed data
 * await warmCache(cache, [
 *   { key: 'config:app', value: appConfig },
 *   { key: 'config:features', value: featureFlags },
 * ], 86400); // 24 hours
 * ```
 */
export async function warmCache<T>(
  cache: ICache,
  data: Array<{ key: string; value: T }>,
  ttl?: number
): Promise<void> {
  await batchSet(cache, data, ttl);
}

/**
 * Tag-based invalidation helper
 * Invalidate all cache entries with a specific tag
 *
 * @param cache - Cache instance
 * @param tag - Tag to invalidate
 * @returns Number of keys deleted
 *
 * @example
 * ```typescript
 * // Set cache entries with tags
 * await cache.set('user:123:profile', profile, 3600);
 * await cache.set('user:123:settings', settings, 3600);
 * await cache.set('user:123:preferences', prefs, 3600);
 *
 * // Invalidate all user:123 entries
 * await invalidateByTag(cache, 'user:123');
 * ```
 */
export async function invalidateByTag(
  cache: ICache,
  tag: string
): Promise<number> {
  return cache.clear(`${tag}:*`);
}
