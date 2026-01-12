import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MemoryCache,
  createCache,
  createCacheFromEnv,
  cacheAside,
  cachedFunction,
  batchGet,
  batchSet,
  warmCache,
  invalidateByTag,
  resetCacheInstance,
} from '../src/index.js';
import type { ICache } from '../src/interfaces.js';

describe('T-043: Connection Pooling & Caching', () => {
  describe('MemoryCache', () => {
    let cache: ICache;

    beforeEach(() => {
      cache = new MemoryCache({
        backend: 'memory',
        ttl: 300,
        prefix: 'test',
        memory: {
          maxEntries: 5,
          cleanupIntervalMs: 100,
        },
      });
    });

    afterEach(async () => {
      await cache.close();
    });

    it('should set and get values', async () => {
      await cache.set('key1', { foo: 'bar' });
      const value = await cache.get<{ foo: string }>('key1');

      expect(value).toEqual({ foo: 'bar' });
    });

    it('should return null for non-existent keys', async () => {
      const value = await cache.get('non-existent');
      expect(value).toBeNull();
    });

    it('should delete keys', async () => {
      await cache.set('key1', 'value1');
      const deleted = await cache.del('key1');

      expect(deleted).toBe(true);
      expect(await cache.get('key1')).toBeNull();
    });

    it('should check if key exists', async () => {
      await cache.set('key1', 'value1');

      expect(await cache.exists('key1')).toBe(true);
      expect(await cache.exists('non-existent')).toBe(false);
    });

    it('should get TTL for keys', async () => {
      await cache.set('key1', 'value1', 60);
      const ttl = await cache.ttl('key1');

      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60);
    });

    it('should return null TTL for non-existent keys', async () => {
      const ttl = await cache.ttl('non-existent');
      expect(ttl).toBeNull();
    });

    it('should expire keys after TTL', async () => {
      await cache.set('key1', 'value1', 0.05); // 50ms

      // Immediately should exist
      expect(await cache.get('key1')).toBe('value1');

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(await cache.get('key1')).toBeNull();
    });

    it('should clear all keys', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.set('key3', 'value3');

      const count = await cache.clear();

      expect(count).toBe(3);
      expect(await cache.get('key1')).toBeNull();
      expect(await cache.get('key2')).toBeNull();
    });

    it('should clear keys by pattern', async () => {
      await cache.set('user:1', 'user1');
      await cache.set('user:2', 'user2');
      await cache.set('post:1', 'post1');

      const count = await cache.clear('user:*');

      expect(count).toBe(2);
      expect(await cache.get('user:1')).toBeNull();
      expect(await cache.get('user:2')).toBeNull();
      expect(await cache.get('post:1')).toBe('post1');
    });

    it('should track cache statistics', async () => {
      await cache.set('key1', 'value1');
      await cache.get('key1'); // Hit
      await cache.get('key2'); // Miss
      await cache.get('key1'); // Hit

      const stats = await cache.stats();

      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(2 / 3);
      expect(stats.operations).toBeGreaterThan(0);
      expect(stats.size).toBe(1);
    });

    it('should evict LRU entries when max capacity reached', async () => {
      // maxEntries is 5, set 6 entries
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.set('key3', 'value3');
      await cache.set('key4', 'value4');
      await cache.set('key5', 'value5');

      // Add 6th entry - triggers LRU eviction
      await cache.set('key6', 'value6');

      const stats = await cache.stats();

      // Should maintain max capacity and evict one entry
      expect(stats.size).toBe(5);
      expect(stats.evictions).toBeGreaterThan(0);
      expect(await cache.get('key6')).toBe('value6'); // Newest entry should exist
    });

    it('should handle complex objects', async () => {
      const complexObject = {
        id: 123,
        name: 'Test',
        nested: {
          array: [1, 2, 3],
          bool: true,
        },
      };

      await cache.set('complex', complexObject);
      const retrieved = await cache.get('complex');

      expect(retrieved).toEqual(complexObject);
    });
  });

  describe('Cache Factory', () => {
    afterEach(() => {
      resetCacheInstance();
    });

    it('should create memory cache from config', () => {
      const cache = createCache({
        backend: 'memory',
        ttl: 300,
        prefix: 'test',
      });

      expect(cache).toBeInstanceOf(MemoryCache);
    });

    it('should create cache from environment', () => {
      process.env.CACHE_BACKEND = 'memory';
      process.env.CACHE_TTL = '600';
      process.env.CACHE_PREFIX = 'myapp';

      const cache = createCacheFromEnv();

      expect(cache).toBeInstanceOf(MemoryCache);

      // Clean up
      cache.close();
    });

    it('should throw error for unsupported backend', () => {
      expect(() =>
        createCache({
          backend: 'unsupported' as any,
        })
      ).toThrow('Unsupported cache backend');
    });
  });

  describe('Cache-Aside Pattern', () => {
    let cache: ICache;

    beforeEach(() => {
      cache = new MemoryCache({
        backend: 'memory',
        ttl: 300,
      });
    });

    afterEach(async () => {
      await cache.close();
    });

    it('should fetch and cache on miss', async () => {
      const fetchFn = vi.fn().mockResolvedValue({ id: 1, name: 'Test' });

      const result1 = await cacheAside(cache, {
        key: 'user:1',
        fetch: fetchFn,
        ttl: 60,
      });

      expect(result1).toEqual({ id: 1, name: 'Test' });
      expect(fetchFn).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const result2 = await cacheAside(cache, {
        key: 'user:1',
        fetch: fetchFn,
        ttl: 60,
      });

      expect(result2).toEqual({ id: 1, name: 'Test' });
      expect(fetchFn).toHaveBeenCalledTimes(1); // Not called again
    });

    it('should work with cached function wrapper', async () => {
      const fetchFn = vi.fn().mockImplementation(async (id: string) => ({
        id,
        name: `User ${id}`,
      }));

      const getUser = cachedFunction(
        cache,
        (id: string) => `user:${id}`,
        fetchFn,
        60
      );

      // First call fetches
      const user1 = await getUser('123');
      expect(user1).toEqual({ id: '123', name: 'User 123' });
      expect(fetchFn).toHaveBeenCalledTimes(1);

      // Second call uses cache
      const user2 = await getUser('123');
      expect(user2).toEqual({ id: '123', name: 'User 123' });
      expect(fetchFn).toHaveBeenCalledTimes(1);

      // Different ID fetches again
      const user3 = await getUser('456');
      expect(user3).toEqual({ id: '456', name: 'User 456' });
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('Batch Operations', () => {
    let cache: ICache;

    beforeEach(() => {
      cache = new MemoryCache({
        backend: 'memory',
        ttl: 300,
      });
    });

    afterEach(async () => {
      await cache.close();
    });

    it('should batch get multiple keys', async () => {
      await cache.set('user:1', { id: 1, name: 'Alice' });
      await cache.set('user:2', { id: 2, name: 'Bob' });
      await cache.set('user:3', { id: 3, name: 'Charlie' });

      const results = await batchGet(cache, ['user:1', 'user:2', 'user:4']);

      expect(results.size).toBe(2);
      expect(results.get('user:1')).toEqual({ id: 1, name: 'Alice' });
      expect(results.get('user:2')).toEqual({ id: 2, name: 'Bob' });
      expect(results.has('user:4')).toBe(false);
    });

    it('should batch set multiple keys', async () => {
      await batchSet(
        cache,
        [
          { key: 'user:1', value: { id: 1, name: 'Alice' } },
          { key: 'user:2', value: { id: 2, name: 'Bob' } },
          { key: 'user:3', value: { id: 3, name: 'Charlie' } },
        ],
        60
      );

      expect(await cache.get('user:1')).toEqual({ id: 1, name: 'Alice' });
      expect(await cache.get('user:2')).toEqual({ id: 2, name: 'Bob' });
      expect(await cache.get('user:3')).toEqual({ id: 3, name: 'Charlie' });
    });

    it('should warm cache with data', async () => {
      await warmCache(
        cache,
        [
          { key: 'config:app', value: { version: '1.0' } },
          { key: 'config:features', value: { featureA: true } },
        ],
        600
      );

      expect(await cache.get('config:app')).toEqual({ version: '1.0' });
      expect(await cache.get('config:features')).toEqual({ featureA: true });
    });

    it('should invalidate by tag', async () => {
      await cache.set('session:123:user', { id: 1 });
      await cache.set('session:123:data', { foo: 'bar' });
      await cache.set('session:456:user', { id: 2 });

      const deleted = await invalidateByTag(cache, 'session:123');

      expect(deleted).toBe(2);
      expect(await cache.get('session:123:user')).toBeNull();
      expect(await cache.get('session:123:data')).toBeNull();
      expect(await cache.get('session:456:user')).toEqual({ id: 2 });
    });
  });

  describe('Cache Metrics', () => {
    let cache: ICache;

    beforeEach(() => {
      cache = new MemoryCache({
        backend: 'memory',
        ttl: 300,
      });
    });

    afterEach(async () => {
      await cache.close();
    });

    it('should track operations and hit rate', async () => {
      // 3 sets
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.set('key3', 'value3');

      // 2 hits, 1 miss
      await cache.get('key1');
      await cache.get('key2');
      await cache.get('key4');

      const stats = await cache.stats();

      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(2 / 3);
      expect(stats.operations).toBeGreaterThan(0);
      expect(stats.size).toBe(3);
    });

    it('should track evictions', async () => {
      const smallCache = new MemoryCache({
        backend: 'memory',
        ttl: 0.05, // 50ms
        memory: { maxEntries: 2 },
      });

      await smallCache.set('key1', 'value1');
      await smallCache.set('key2', 'value2');
      await smallCache.set('key3', 'value3'); // Evicts key1

      const stats = await smallCache.stats();

      expect(stats.size).toBe(2);
      expect(stats.evictions).toBe(1);

      await smallCache.close();
    });
  });
});
