/**
 * In-memory cache implementation for development
 * Uses Map with LRU eviction and TTL expiration
 */
import type { ICache, CacheConfig, CacheEntry, CacheStats } from './interfaces.js';

export class MemoryCache implements ICache {
  private cache: Map<string, CacheEntry<unknown>>;
  private accessOrder: Map<string, number>; // Track access time for LRU
  private readonly defaultTtl: number;
  private readonly maxEntries: number;
  private readonly prefix: string;
  private _stats: {
    operations: number;
    hits: number;
    misses: number;
    evictions: number;
  };
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config: CacheConfig) {
    this.cache = new Map();
    this.accessOrder = new Map();
    this.defaultTtl = (config.ttl ?? 300) * 1000; // Convert to ms
    this.maxEntries = config.memory?.maxEntries ?? 1000;
    this.prefix = config.prefix ?? '';
    this._stats = {
      operations: 0,
      hits: 0,
      misses: 0,
      evictions: 0,
    };

    // Start periodic cleanup of expired entries
    const cleanupIntervalMs = config.memory?.cleanupIntervalMs ?? 60000; // 1 minute
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, cleanupIntervalMs);
  }

  private prefixKey(key: string): string {
    return this.prefix ? `${this.prefix}:${key}` : key;
  }

  private cleanupExpired(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      this._stats.evictions++;
    }
  }

  private evictLRU(): void {
    // Find and remove least recently used entry
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, time] of this.accessOrder.entries()) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.accessOrder.delete(oldestKey);
      this._stats.evictions++;
    }
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    this._stats.operations++;

    const prefixedKey = this.prefixKey(key);
    const entry = this.cache.get(prefixedKey) as CacheEntry<T> | undefined;

    if (!entry) {
      this._stats.misses++;
      return null;
    }

    const now = Date.now();
    if (entry.expiresAt <= now) {
      // Expired, delete and return null
      this.cache.delete(prefixedKey);
      this.accessOrder.delete(prefixedKey);
      this._stats.misses++;
      this.stats.evictions++;
      return null;
    }

    // Update access time for LRU
    this.accessOrder.set(prefixedKey, now);
    this._stats.hits++;
    return entry.value;
  }

  async set<T = unknown>(key: string, value: T, ttl?: number): Promise<boolean> {
    this._stats.operations++;

    const prefixedKey = this.prefixKey(key);
    const now = Date.now();
    const ttlMs = (ttl ?? this.defaultTtl / 1000) * 1000;

    // Check if we need to evict to make room
    if (!this.cache.has(prefixedKey) && this.cache.size >= this.maxEntries) {
      this.evictLRU();
    }

    const entry: CacheEntry<T> = {
      value,
      expiresAt: now + ttlMs,
      createdAt: now,
    };

    this.cache.set(prefixedKey, entry);
    this.accessOrder.set(prefixedKey, now);

    return true;
  }

  async del(key: string): Promise<boolean> {
    this._stats.operations++;

    const prefixedKey = this.prefixKey(key);
    const existed = this.cache.has(prefixedKey);

    this.cache.delete(prefixedKey);
    this.accessOrder.delete(prefixedKey);

    return existed;
  }

  async exists(key: string): Promise<boolean> {
    const prefixedKey = this.prefixKey(key);
    const entry = this.cache.get(prefixedKey);

    if (!entry) {
      return false;
    }

    const now = Date.now();
    if (entry.expiresAt <= now) {
      // Expired
      this.cache.delete(prefixedKey);
      this.accessOrder.delete(prefixedKey);
      return false;
    }

    return true;
  }

  async ttl(key: string): Promise<number | null> {
    const prefixedKey = this.prefixKey(key);
    const entry = this.cache.get(prefixedKey);

    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (entry.expiresAt <= now) {
      // Expired
      this.cache.delete(prefixedKey);
      this.accessOrder.delete(prefixedKey);
      return null;
    }

    return Math.ceil((entry.expiresAt - now) / 1000);
  }

  async clear(pattern?: string): Promise<number> {
    if (!pattern) {
      const count = this.cache.size;
      this.cache.clear();
      this.accessOrder.clear();
      return count;
    }

    // Pattern matching: convert glob pattern to regex
    const regex = new RegExp(
      '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
    );

    const keysToDelete: string[] = [];
    for (const key of this.cache.keys()) {
      // Remove prefix for pattern matching
      const unprefixedKey = this.prefix
        ? key.slice(this.prefix.length + 1)
        : key;

      if (regex.test(unprefixedKey)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
    }

    return keysToDelete.length;
  }

  async stats(): Promise<CacheStats> {
    // Clean up expired entries before reporting stats
    this.cleanupExpired();

    const hitRate =
      this._stats.operations > 0
        ? this._stats.hits / (this._stats.hits + this._stats.misses)
        : 0;

    return {
      operations: this._stats.operations,
      hits: this._stats.hits,
      misses: this._stats.misses,
      hitRate,
      size: this.cache.size,
      evictions: this._stats.evictions,
    };
  }

  async close(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }

    this.cache.clear();
    this.accessOrder.clear();
  }
}
