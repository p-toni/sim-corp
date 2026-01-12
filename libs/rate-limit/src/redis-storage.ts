import Redis from 'ioredis';
import type { IRateLimitStorage } from './interfaces';

/**
 * Redis-based rate limit storage for distributed systems.
 * Suitable for multi-node deployments with shared state.
 */
export class RedisStorage implements IRateLimitStorage {
  private client: Redis;

  constructor(options: {
    /** Redis client instance */
    client?: Redis;
    /** Redis connection URL */
    url?: string;
    /** Redis host */
    host?: string;
    /** Redis port */
    port?: number;
    /** Redis password */
    password?: string;
    /** Redis database number */
    db?: number;
    /** Key prefix for rate limit keys */
    keyPrefix?: string;
  } = {}) {
    if (options.client) {
      this.client = options.client;
    } else if (options.url) {
      this.client = new Redis(options.url);
    } else {
      this.client = new Redis({
        host: options.host ?? 'localhost',
        port: options.port ?? 6379,
        password: options.password,
        db: options.db ?? 0,
        keyPrefix: options.keyPrefix ?? 'ratelimit:'
      });
    }
  }

  async increment(key: string, windowMs: number): Promise<number> {
    const multi = this.client.multi();

    // Increment counter
    multi.incr(key);

    // Set expiry if key is new (NX = only if doesn't exist)
    multi.pexpire(key, windowMs, 'NX');

    const results = await multi.exec();

    if (!results || results.length === 0) {
      throw new Error('Redis transaction failed');
    }

    // First result is INCR command
    const [incrErr, count] = results[0];
    if (incrErr) {
      throw incrErr;
    }

    return count as number;
  }

  async get(key: string): Promise<number> {
    const value = await this.client.get(key);
    return value ? parseInt(value, 10) : 0;
  }

  async ttl(key: string): Promise<number> {
    const ttl = await this.client.pttl(key);
    // pttl returns -2 if key doesn't exist, -1 if no expiry
    return ttl > 0 ? ttl : 0;
  }

  async reset(key: string): Promise<void> {
    await this.client.del(key);
  }

  async keys(): Promise<string[]> {
    // Get all rate limit keys (uses SCAN for safety with large keyspaces)
    const keys: string[] = [];
    const stream = this.client.scanStream({
      match: '*',
      count: 100
    });

    for await (const resultKeys of stream) {
      keys.push(...resultKeys);
    }

    return keys;
  }

  /**
   * Close Redis connection
   */
  async disconnect(): Promise<void> {
    await this.client.quit();
  }

  /**
   * Get Redis client (for advanced use cases)
   */
  getClient(): Redis {
    return this.client;
  }
}
