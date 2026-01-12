import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryStorage } from '../src/memory-storage';
import { RateLimiter } from '../src/rate-limiter';
import { TokenBucket } from '../src/token-bucket';
import {
  IpRateLimitStrategy,
  UserRateLimitStrategy,
  OrgRateLimitStrategy,
  EndpointRateLimitStrategy
} from '../src/strategies';
import { RateLimitFactory } from '../src/factory';
import type { RateLimitConfig } from '../src/interfaces';

describe('T-042: Rate Limiting & Throttling', () => {
  describe('MemoryStorage', () => {
    let storage: MemoryStorage;

    beforeEach(() => {
      storage = new MemoryStorage({ cleanupIntervalMs: 100 });
    });

    afterEach(() => {
      storage.destroy();
    });

    it('should increment counter', async () => {
      const count1 = await storage.increment('test-key', 1000);
      const count2 = await storage.increment('test-key', 1000);
      const count3 = await storage.increment('test-key', 1000);

      expect(count1).toBe(1);
      expect(count2).toBe(2);
      expect(count3).toBe(3);
    });

    it('should reset counter after window expires', async () => {
      await storage.increment('test-key', 50); // 50ms window
      await new Promise(resolve => setTimeout(resolve, 60));

      const count = await storage.increment('test-key', 1000);
      expect(count).toBe(1); // Reset to 1
    });

    it('should get current count', async () => {
      await storage.increment('test-key', 1000);
      await storage.increment('test-key', 1000);

      const count = await storage.get('test-key');
      expect(count).toBe(2);
    });

    it('should return 0 for non-existent key', async () => {
      const count = await storage.get('non-existent');
      expect(count).toBe(0);
    });

    it('should get TTL', async () => {
      await storage.increment('test-key', 1000);
      const ttl = await storage.ttl('test-key');

      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(1000);
    });

    it('should reset key', async () => {
      await storage.increment('test-key', 1000);
      await storage.reset('test-key');

      const count = await storage.get('test-key');
      expect(count).toBe(0);
    });

    it('should list keys', async () => {
      await storage.increment('key1', 1000);
      await storage.increment('key2', 1000);
      await storage.increment('key3', 1000);

      const keys = await storage.keys();
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toContain('key3');
    });

    it('should clean up expired entries', async () => {
      await storage.increment('short-lived', 50);
      await new Promise(resolve => setTimeout(resolve, 150)); // Wait for cleanup

      const keys = await storage.keys();
      expect(keys).not.toContain('short-lived');
    });
  });

  describe('RateLimiter', () => {
    let storage: MemoryStorage;
    let limiter: RateLimiter;
    let config: RateLimitConfig;

    beforeEach(() => {
      storage = new MemoryStorage();
      config = {
        maxRequests: 5,
        windowMs: 1000
      };
      limiter = new RateLimiter(storage, config);
    });

    afterEach(() => {
      storage.destroy();
    });

    it('should allow requests within limit', async () => {
      const result1 = await limiter.check('test-key');
      const result2 = await limiter.check('test-key');
      const result3 = await limiter.check('test-key');

      expect(result1.allowed).toBe(true);
      expect(result1.info.remaining).toBe(4);
      expect(result2.allowed).toBe(true);
      expect(result2.info.remaining).toBe(3);
      expect(result3.allowed).toBe(true);
      expect(result3.info.remaining).toBe(2);
    });

    it('should block requests exceeding limit', async () => {
      // Make 5 requests (at limit)
      for (let i = 0; i < 5; i++) {
        await limiter.check('test-key');
      }

      // 6th request should be blocked
      const result = await limiter.check('test-key');
      expect(result.allowed).toBe(false);
      expect(result.info.exceeded).toBe(true);
      expect(result.info.remaining).toBe(0);
    });

    it('should provide rate limit info', async () => {
      const result = await limiter.check('test-key');

      expect(result.info.current).toBe(1);
      expect(result.info.limit).toBe(5);
      expect(result.info.remaining).toBe(4);
      expect(result.info.resetMs).toBeGreaterThan(0);
      expect(result.info.resetAt).toBeInstanceOf(Date);
      expect(result.info.exceeded).toBe(false);
    });

    it('should reset counter', async () => {
      await limiter.check('test-key');
      await limiter.check('test-key');

      await limiter.reset('test-key');

      const count = await limiter.getCount('test-key');
      expect(count).toBe(0);
    });

    it('should call onLimitReached handler', async () => {
      const onLimitReached = vi.fn();
      const configWithHandler = { ...config, onLimitReached };

      for (let i = 0; i < 6; i++) {
        await limiter.check('test-key', configWithHandler);
      }

      expect(onLimitReached).toHaveBeenCalled();
    });

    it('should skip rate limiting when skip returns true', async () => {
      const skip = vi.fn().mockResolvedValue(true);
      const configWithSkip = { ...config, skip };

      // Make many requests (would normally exceed limit)
      for (let i = 0; i < 10; i++) {
        const result = await limiter.check('test-key', configWithSkip);
        expect(result.allowed).toBe(true);
      }

      expect(skip).toHaveBeenCalled();
    });

    it('should track metrics', async () => {
      await limiter.check('key1');
      await limiter.check('key2');

      // Exceed limit for key3
      for (let i = 0; i < 6; i++) {
        await limiter.check('key3');
      }

      const metrics = await limiter.getMetrics();
      expect(metrics.totalRequests).toBe(8);
      expect(metrics.allowedRequests).toBe(7);
      expect(metrics.blockedRequests).toBe(1);
      expect(metrics.activeKeys).toBeGreaterThan(0);
    });
  });

  describe('TokenBucket', () => {
    let storage: MemoryStorage;
    let bucket: TokenBucket;

    beforeEach(() => {
      storage = new MemoryStorage();
      bucket = new TokenBucket(storage, {
        capacity: 10,
        refillRate: 2,
        refillIntervalMs: 1000
      });
    });

    afterEach(() => {
      storage.destroy();
    });

    it('should allow consuming tokens within capacity', async () => {
      const result1 = await bucket.consume('test-bucket', 3);
      const result2 = await bucket.consume('test-bucket', 3);

      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(7);
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(4);
    });

    it('should block when not enough tokens', async () => {
      await bucket.consume('test-bucket', 8);

      const result = await bucket.consume('test-bucket', 5);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(2);
    });

    it('should refill tokens over time', async () => {
      await bucket.consume('test-bucket', 10); // Empty bucket

      // Wait for refill (1 second = 2 tokens)
      await new Promise(resolve => setTimeout(resolve, 1100));

      const result = await bucket.consume('test-bucket', 2);
      expect(result.allowed).toBe(true);
    });

    it('should not exceed capacity when refilling', async () => {
      // Wait for multiple refill intervals
      await new Promise(resolve => setTimeout(resolve, 5000));

      const result = await bucket.consume('test-bucket', 10);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(0); // Capacity is 10, not more
    });
  });

  describe('Rate Limit Strategies', () => {
    let config: RateLimitConfig;

    beforeEach(() => {
      config = {
        maxRequests: 100,
        windowMs: 60000
      };
    });

    it('should extract IP from context (IpRateLimitStrategy)', () => {
      const strategy = new IpRateLimitStrategy(config);

      const context1 = { ip: '192.168.1.1' };
      const context2 = { headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' } };
      const context3 = { socket: { remoteAddress: '127.0.0.1' } };

      expect(strategy.getKey(context1)).toBe('ip:192.168.1.1');
      expect(strategy.getKey(context2)).toBe('ip:10.0.0.1');
      expect(strategy.getKey(context3)).toBe('ip:127.0.0.1');
    });

    it('should extract user ID from context (UserRateLimitStrategy)', () => {
      const strategy = new UserRateLimitStrategy(config);

      const context1 = { user: { id: 'user123' } };
      const context2 = { userId: 'user456' };
      const context3 = {};

      expect(strategy.getKey(context1)).toBe('user:user123');
      expect(strategy.getKey(context2)).toBe('user:user456');
      expect(strategy.getKey(context3)).toBe('user:anonymous');
    });

    it('should extract org ID from context (OrgRateLimitStrategy)', () => {
      const strategy = new OrgRateLimitStrategy(config);

      const context1 = { user: { orgId: 'org123' } };
      const context2 = { orgId: 'org456' };
      const context3 = { organization: { id: 'org789' } };

      expect(strategy.getKey(context1)).toBe('org:org123');
      expect(strategy.getKey(context2)).toBe('org:org456');
      expect(strategy.getKey(context3)).toBe('org:org789');
    });

    it('should match endpoint patterns (EndpointRateLimitStrategy)', () => {
      const endpointConfigs = new Map([
        ['/api/expensive', { maxRequests: 10, windowMs: 60000 }],
        ['/api/public/*', { maxRequests: 100, windowMs: 60000 }]
      ]);

      const strategy = new EndpointRateLimitStrategy(endpointConfigs, config);

      const context1 = { url: '/api/expensive' };
      const context2 = { url: '/api/public/data' };
      const context3 = { url: '/other' };

      expect(strategy.getKey(context1)).toBe('endpoint:/api/expensive');
      expect(strategy.getConfig(context1).maxRequests).toBe(10);

      expect(strategy.getKey(context2)).toBe('endpoint:/api/public/data');
      expect(strategy.getConfig(context2).maxRequests).toBe(100);

      expect(strategy.getConfig(context3).maxRequests).toBe(100); // Default
    });
  });

  describe('RateLimitFactory', () => {
    beforeEach(() => {
      RateLimitFactory.resetInstance();
    });

    afterEach(() => {
      RateLimitFactory.resetInstance();
    });

    it('should create memory storage by default', () => {
      process.env.RATE_LIMIT_STORAGE = 'memory';

      const storage = RateLimitFactory.createStorage();
      expect(storage).toBeInstanceOf(MemoryStorage);

      (storage as MemoryStorage).destroy();
    });

    it('should create rate limiter from environment', () => {
      process.env.RATE_LIMIT_MAX_REQUESTS = '50';
      process.env.RATE_LIMIT_WINDOW_MS = '30000';

      const limiter = RateLimitFactory.createRateLimiter();
      expect(limiter).toBeInstanceOf(RateLimiter);
    });

    it('should create IP strategy by default', () => {
      process.env.RATE_LIMIT_STRATEGY = 'ip';

      const { rateLimiter, strategy } = RateLimitFactory.createFromEnv();
      expect(strategy).toBeInstanceOf(IpRateLimitStrategy);
      expect(strategy.name).toBe('ip');
    });

    it('should create user strategy', () => {
      process.env.RATE_LIMIT_STRATEGY = 'user';

      const { strategy } = RateLimitFactory.createFromEnv();
      expect(strategy).toBeInstanceOf(UserRateLimitStrategy);
      expect(strategy.name).toBe('user');
    });

    it('should create org strategy', () => {
      process.env.RATE_LIMIT_STRATEGY = 'org';

      const { strategy } = RateLimitFactory.createFromEnv();
      expect(strategy).toBeInstanceOf(OrgRateLimitStrategy);
      expect(strategy.name).toBe('org');
    });

    it('should create singleton instance', () => {
      const instance1 = RateLimitFactory.getInstance();
      const instance2 = RateLimitFactory.getInstance();

      expect(instance1).toBe(instance2);
      expect(instance1.rateLimiter).toBe(instance2.rateLimiter);
    });

    it('should reset singleton instance', () => {
      const instance1 = RateLimitFactory.getInstance();
      RateLimitFactory.resetInstance();
      const instance2 = RateLimitFactory.getInstance();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('End-to-end rate limiting workflow', () => {
    it('should support complete rate limiting workflow', async () => {
      // Create rate limiter
      const storage = new MemoryStorage();
      const limiter = new RateLimiter(storage, {
        maxRequests: 10,
        windowMs: 60000
      });

      const strategy = new IpRateLimitStrategy({
        maxRequests: 10,
        windowMs: 60000
      });

      // Simulate multiple requests from same IP
      const context = { ip: '192.168.1.100' };
      const key = strategy.getKey(context);

      let allowedCount = 0;
      let blockedCount = 0;

      for (let i = 0; i < 15; i++) {
        const result = await limiter.check(key);
        if (result.allowed) {
          allowedCount++;
        } else {
          blockedCount++;
        }
      }

      expect(allowedCount).toBe(10);
      expect(blockedCount).toBe(5);

      // Check metrics
      const metrics = await limiter.getMetrics();
      expect(metrics.totalRequests).toBe(15);
      expect(metrics.allowedRequests).toBe(10);
      expect(metrics.blockedRequests).toBe(5);

      storage.destroy();
    });

    it('should support per-user rate limiting', async () => {
      const storage = new MemoryStorage();
      const limiter = new RateLimiter(storage, {
        maxRequests: 5,
        windowMs: 60000
      });

      const strategy = new UserRateLimitStrategy({
        maxRequests: 5,
        windowMs: 60000
      });

      // User 1 makes requests
      const user1Context = { user: { id: 'user1' } };
      const user1Key = strategy.getKey(user1Context);

      for (let i = 0; i < 5; i++) {
        const result = await limiter.check(user1Key);
        expect(result.allowed).toBe(true);
      }

      // 6th request blocked
      const user1Blocked = await limiter.check(user1Key);
      expect(user1Blocked.allowed).toBe(false);

      // User 2 can still make requests
      const user2Context = { user: { id: 'user2' } };
      const user2Key = strategy.getKey(user2Context);

      const user2Result = await limiter.check(user2Key);
      expect(user2Result.allowed).toBe(true);

      storage.destroy();
    });
  });
});
