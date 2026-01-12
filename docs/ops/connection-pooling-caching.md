# Connection Pooling & Caching Setup Guide

This guide explains connection pooling and caching in Sim-Corp services for optimized production performance.

## Table of Contents

- [Overview](#overview)
- [Connection Pooling](#connection-pooling)
- [Caching](#caching)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Best Practices](#best-practices)

## Overview

T-043 implements two key performance optimizations:

1. **Database Connection Pooling**: Reuses PostgreSQL connections to reduce overhead
2. **Distributed Caching**: Memory and Redis backends for frequently accessed data

## Connection Pooling

### PostgreSQL Pool Configuration

The `@sim-corp/database` library includes built-in connection pooling via `pg.Pool`:

```typescript
import { createDatabaseFromEnv } from '@sim-corp/database';

const db = await createDatabaseFromEnv({
  schema: schemaSQL,
  migrate: async (db) => {
    // Run migrations
  },
});

// Get pool statistics
const stats = db.getPoolStats();
if (stats) {
  console.log(`Active: ${stats.active}, Idle: ${stats.idle}, Waiting: ${stats.waiting}`);
}
```

### Environment Variables

```bash
DATABASE_TYPE=postgres
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=simcorp
DATABASE_USER=postgres
DATABASE_PASSWORD=secret
DATABASE_POOL_MIN=2     # Minimum connections (default: 2)
DATABASE_POOL_MAX=10    # Maximum connections (default: 10)
```

### Pool Statistics API

```typescript
interface PoolStats {
  size: number;      // Total pool size (max connections)
  active: number;    // Connections currently in use
  idle: number;      // Idle connections available
  waiting: number;   // Requests waiting for connection
}
```

## Caching

### Cache Backends

**Memory Cache (Development)**:
- Fast, in-memory storage
- LRU eviction when capacity reached
- Automatic cleanup of expired entries
- No external dependencies

**Redis Cache (Production)**:
- Distributed, persistent storage
- Shared across multiple service instances
- Atomic operations via ioredis
- Scalable for high-traffic deployments

### Quick Start

```typescript
import { createCacheFromEnv, cacheAside } from '@sim-corp/cache';

// Create cache from environment
const cache = createCacheFromEnv();

// Cache-aside pattern
const user = await cacheAside(cache, {
  key: `user:${userId}`,
  fetch: async () => await db.getUser(userId),
  ttl: 3600, // 1 hour
});

// Manual operations
await cache.set('key', value, 300);
const value = await cache.get('key');
await cache.del('key');

// Statistics
const stats = await cache.stats();
console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(2)}%`);
```

### Environment Configuration

**Memory Cache (Development)**:
```bash
CACHE_BACKEND=memory
CACHE_TTL=300                      # Default TTL in seconds
CACHE_PREFIX=simcorp               # Key prefix
CACHE_MEMORY_MAX_ENTRIES=1000      # Max cache entries
CACHE_MEMORY_CLEANUP_INTERVAL=60000 # Cleanup interval (ms)
```

**Redis Cache (Production)**:
```bash
CACHE_BACKEND=redis
CACHE_TTL=300
CACHE_PREFIX=simcorp
REDIS_URL=redis://localhost:6379
# OR
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=secret
REDIS_DB=0
```

### Cache-Aside Pattern

Automatically fetch and cache on miss:

```typescript
import { cacheAside, cachedFunction } from '@sim-corp/cache';

// Direct cache-aside
const session = await cacheAside(cache, {
  key: `session:${sessionId}`,
  fetch: async () => await repo.getSession(sessionId),
  ttl: 600,
});

// Wrapped function
const getSession = cachedFunction(
  cache,
  (id: string) => `session:${id}`,
  async (id: string) => await repo.getSession(id),
  600
);

const session = await getSession(sessionId);
```

### Batch Operations

```typescript
import { batchGet, batchSet, warmCache } from '@sim-corp/cache';

// Batch get
const keys = ['user:1', 'user:2', 'user:3'];
const cached = await batchGet(cache, keys);

// Batch set
await batchSet(cache, [
  { key: 'user:1', value: user1 },
  { key: 'user:2', value: user2 },
], 3600);

// Cache warming
await warmCache(cache, [
  { key: 'config:app', value: appConfig },
  { key: 'config:features', value: featureFlags },
], 86400);
```

### Tag-Based Invalidation

```typescript
import { invalidateByTag } from '@sim-corp/cache';

// Set related entries
await cache.set('session:123:user', userData);
await cache.set('session:123:data', sessionData);

// Invalidate all session:123 entries
await invalidateByTag(cache, 'session:123');
```

### Cache Metrics

```typescript
const stats = await cache.stats();

console.log({
  operations: stats.operations,   // Total operations
  hits: stats.hits,               // Cache hits
  misses: stats.misses,           // Cache misses
  hitRate: stats.hitRate,         // Hit rate (0-1)
  size: stats.size,               // Current entries
  evictions: stats.evictions,     // LRU evictions (memory only)
});
```

## Configuration

### Connection Pool Tuning

**Development** (low load):
```bash
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=5
```

**Production** (high load):
```bash
DATABASE_POOL_MIN=5
DATABASE_POOL_MAX=20
```

**Guidelines**:
- Min: 2-5 connections per service instance
- Max: 10-20 connections per service instance
- Total max across all instances should not exceed PostgreSQL max_connections
- Monitor waiting requests - increase max if consistently high

### Cache Sizing

**Memory Cache**:
```bash
CACHE_MEMORY_MAX_ENTRIES=1000  # Small services
CACHE_MEMORY_MAX_ENTRIES=10000 # Large services
```

**Redis Cache**:
- Configure maxmemory and eviction policy in redis.conf
- Use allkeys-lru or volatile-lru eviction policy
- Monitor memory usage via Redis INFO command

## Best Practices

### Connection Pooling

1. **Monitor pool statistics**:
```typescript
setInterval(async () => {
  const stats = db.getPoolStats();
  if (stats && stats.waiting > 0) {
    console.warn('Connection pool exhausted:', stats);
  }
}, 60000);
```

2. **Use transactions for multiple operations**:
```typescript
await db.withTransaction(async (tx) => {
  await tx.exec('INSERT INTO users ...');
  await tx.exec('UPDATE accounts ...');
});
```

3. **Close connections on shutdown**:
```typescript
process.on('SIGTERM', async () => {
  await db.close();
  process.exit(0);
});
```

### Caching

1. **Choose appropriate TTLs**:
   - Static data: 24 hours (86400s)
   - User profiles: 1 hour (3600s)
   - Session data: 10 minutes (600s)
   - Realtime data: 30 seconds (30s)

2. **Use cache-aside pattern** for safety:
```typescript
// Always works even if cache fails
const data = await cacheAside(cache, {
  key: 'data',
  fetch: () => fetchFromDatabase(),
  ttl: 300,
});
```

3. **Invalidate on updates**:
```typescript
async function updateUser(id: string, updates: Partial<User>) {
  await db.updateUser(id, updates);
  await cache.del(`user:${id}`); // Invalidate cache
}
```

4. **Use prefixes to avoid collisions**:
```bash
CACHE_PREFIX=simcorp:dev   # Development
CACHE_PREFIX=simcorp:prod  # Production
```

5. **Monitor cache performance**:
```typescript
setInterval(async () => {
  const stats = await cache.stats();
  if (stats.hitRate < 0.5) {
    console.warn('Low cache hit rate:', stats.hitRate);
  }
}, 300000); // Every 5 minutes
```

## Troubleshooting

### Connection Pool Exhaustion

**Symptoms**: High waiting count, slow queries

**Solutions**:
1. Increase DATABASE_POOL_MAX
2. Check for connection leaks (unclosed transactions)
3. Review slow queries blocking connections
4. Scale horizontally (add service instances)

### Low Cache Hit Rate

**Symptoms**: Hit rate < 50%

**Solutions**:
1. Increase TTL for stable data
2. Pre-warm cache on startup
3. Review which data is being cached
4. Ensure cache invalidation isn't too aggressive

### Redis Connection Issues

**Symptoms**: Cache operations failing

**Solutions**:
1. Verify REDIS_URL is correct
2. Check Redis is running: `redis-cli ping`
3. Review Redis logs for errors
4. Check network connectivity
5. Fall back to memory cache if Redis unavailable

### Memory Cache Thrashing

**Symptoms**: High eviction rate, frequent cache misses

**Solutions**:
1. Increase CACHE_MEMORY_MAX_ENTRIES
2. Reduce TTL for less important data
3. Use Redis cache for production
4. Review what's being cached

## Summary

T-043 provides production-ready connection pooling and caching:

- ✅ PostgreSQL connection pooling with statistics API
- ✅ Memory cache (development) and Redis cache (production)
- ✅ Cache-aside pattern with helpers
- ✅ LRU eviction and TTL expiration
- ✅ Batch operations and cache warming
- ✅ Comprehensive metrics (hit rate, operations, evictions)
- ✅ Tag-based invalidation
- ✅ Environment-based configuration

For most services, use memory cache for development and Redis for production with appropriate TTLs based on data volatility.
