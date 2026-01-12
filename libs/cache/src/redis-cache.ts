/**
 * Redis cache implementation for production
 * Uses ioredis for high-performance Redis operations
 */
import Redis from 'ioredis';
import type { ICache, CacheConfig, CacheStats } from './interfaces.js';

export class RedisCache implements ICache {
  private client: Redis;
  private readonly defaultTtl: number;
  private readonly prefix: string;
  private _stats: {
    operations: number;
    hits: number;
    misses: number;
  };

  constructor(config: CacheConfig) {
    if (!config.redis) {
      throw new Error('Redis configuration required for RedisCache');
    }

    this.defaultTtl = config.ttl ?? 300; // seconds
    this.prefix = config.prefix ?? '';
    this._stats = {
      operations: 0,
      hits: 0,
      misses: 0,
    };

    // Create Redis client
    if (config.redis.url) {
      this.client = new Redis(config.redis.url);
    } else {
      this.client = new Redis({
        host: config.redis.host ?? 'localhost',
        port: config.redis.port ?? 6379,
        password: config.redis.password,
        db: config.redis.db ?? 0,
      });
    }

    // Handle connection errors
    this.client.on('error', (err) => {
      console.error('Redis client error:', err);
    });
  }

  private prefixKey(key: string): string {
    return this.prefix ? `${this.prefix}:${key}` : key;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    this._stats.operations++;

    const prefixedKey = this.prefixKey(key);
    const value = await this.client.get(prefixedKey);

    if (value === null) {
      this._stats.misses++;
      return null;
    }

    this._stats.hits++;

    try {
      return JSON.parse(value) as T;
    } catch (error) {
      console.error('Failed to parse cached value:', error);
      return null;
    }
  }

  async set<T = unknown>(key: string, value: T, ttl?: number): Promise<boolean> {
    this._stats.operations++;

    const prefixedKey = this.prefixKey(key);
    const ttlSeconds = ttl ?? this.defaultTtl;
    const serialized = JSON.stringify(value);

    // Use SETEX to set value with expiration atomically
    const result = await this.client.setex(prefixedKey, ttlSeconds, serialized);

    return result === 'OK';
  }

  async del(key: string): Promise<boolean> {
    this._stats.operations++;

    const prefixedKey = this.prefixKey(key);
    const result = await this.client.del(prefixedKey);

    return result > 0;
  }

  async exists(key: string): Promise<boolean> {
    const prefixedKey = this.prefixKey(key);
    const result = await this.client.exists(prefixedKey);

    return result === 1;
  }

  async ttl(key: string): Promise<number | null> {
    const prefixedKey = this.prefixKey(key);
    const result = await this.client.ttl(prefixedKey);

    // TTL returns -2 if key doesn't exist, -1 if no expiration
    if (result === -2) {
      return null;
    }

    return result;
  }

  async clear(pattern?: string): Promise<number> {
    if (!pattern) {
      // Clear all keys with prefix
      const scanPattern = this.prefix ? `${this.prefix}:*` : '*';
      return this.clearByPattern(scanPattern);
    }

    // Combine prefix with user pattern
    const prefixedPattern = this.prefixKey(pattern);
    return this.clearByPattern(prefixedPattern);
  }

  private async clearByPattern(pattern: string): Promise<number> {
    let cursor = '0';
    let deletedCount = 0;

    do {
      // Use SCAN for safe iteration (doesn't block Redis)
      const [nextCursor, keys] = await this.client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100
      );

      cursor = nextCursor;

      if (keys.length > 0) {
        const deleted = await this.client.del(...keys);
        deletedCount += deleted;
      }
    } while (cursor !== '0');

    return deletedCount;
  }

  async stats(): Promise<CacheStats> {
    // Get Redis INFO for accurate size
    const info = await this.client.info('keyspace');
    let size = 0;

    // Parse keyspace info to get number of keys
    // Format: db0:keys=X,expires=Y,avg_ttl=Z
    const match = info.match(/keys=(\d+)/);
    if (match) {
      size = Number.parseInt(match[1], 10);
    }

    const hitRate =
      this._stats.operations > 0
        ? this._stats.hits / (this._stats.hits + this._stats.misses)
        : 0;

    return {
      operations: this._stats.operations,
      hits: this._stats.hits,
      misses: this._stats.misses,
      hitRate,
      size,
    };
  }

  async close(): Promise<void> {
    await this.client.quit();
  }
}
