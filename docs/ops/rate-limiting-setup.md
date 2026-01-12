# Rate Limiting & Throttling Setup Guide

This guide explains how to implement rate limiting and throttling in Sim-Corp services using the `@sim-corp/rate-limit` library.

## Table of Contents

- [Overview](#overview)
- [Core Concepts](#core-concepts)
- [Quick Start](#quick-start)
- [Storage Backends](#storage-backends)
- [Rate Limit Strategies](#rate-limit-strategies)
- [Fastify Integration](#fastify-integration)
- [Configuration](#configuration)
- [Monitoring & Metrics](#monitoring--metrics)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

The `@sim-corp/rate-limit` library provides:

- **Multiple Algorithms**: Sliding window and token bucket algorithms
- **Storage Backends**: In-memory (development) and Redis (production)
- **Flexible Strategies**: IP, user, organization, API key, endpoint-based limiting
- **Fastify Integration**: Pre-built middleware for easy setup
- **Metrics**: Built-in monitoring and observability
- **Environment Configuration**: Simple setup via environment variables

## Core Concepts

### Rate Limiting Algorithms

#### 1. Sliding Window (Default)

The sliding window algorithm tracks requests within a time window and enforces a maximum request count.

**Characteristics:**
- Simple to implement and understand
- Memory efficient
- Fixed window boundaries
- Suitable for most use cases

**Use cases:**
- General API rate limiting
- Protecting endpoints from abuse
- Fair resource allocation

#### 2. Token Bucket

The token bucket algorithm allows burst traffic while maintaining an average rate over time.

**Characteristics:**
- Allows controlled bursts
- Tokens refill at a constant rate
- More flexible than sliding window
- Better for bursty workloads

**Use cases:**
- File uploads/downloads
- Batch processing APIs
- Services with predictable burst patterns

### Storage Backends

#### Memory Storage
- **Use for**: Development, single-node deployments
- **Pros**: Fast, no external dependencies
- **Cons**: Not shared across instances, lost on restart

#### Redis Storage
- **Use for**: Production, multi-node deployments
- **Pros**: Distributed, persistent, scalable
- **Cons**: Requires Redis infrastructure

## Quick Start

### 1. Add Dependency

Add to your service's `package.json`:

```json
{
  "dependencies": {
    "@sim-corp/rate-limit": "workspace:*"
  }
}
```

### 2. Basic Fastify Integration

```typescript
import { RateLimitFactory, FastifyRateLimitPlugin } from "@sim-corp/rate-limit";

const { rateLimiter, strategy } = RateLimitFactory.getInstance();
const rateLimitPlugin = new FastifyRateLimitPlugin(rateLimiter, strategy);

app.addHook('preHandler', async (request, reply) => {
  // Skip rate limiting for health checks and metrics
  if (request.url === '/health' || request.url === '/metrics') {
    return;
  }
  await rateLimitPlugin.createHook()(request, reply);
});
```

### 3. Configure Environment Variables

```bash
# Rate limiting configuration
RATE_LIMIT_STORAGE=memory              # or 'redis'
RATE_LIMIT_STRATEGY=ip                 # 'ip', 'user', or 'org'
RATE_LIMIT_MAX_REQUESTS=100            # requests per window
RATE_LIMIT_WINDOW_MS=60000             # window size in milliseconds (1 minute)
RATE_LIMIT_MESSAGE="Too many requests" # custom error message
RATE_LIMIT_STATUS_CODE=429             # HTTP status code

# Redis configuration (if using Redis storage)
REDIS_URL=redis://localhost:6379       # Redis connection URL
# OR
REDIS_HOST=localhost                   # Redis host
REDIS_PORT=6379                        # Redis port
REDIS_PASSWORD=yourpassword            # Redis password (optional)
```

## Storage Backends

### Memory Storage

**Configuration:**
```typescript
import { MemoryStorage, RateLimiter } from "@sim-corp/rate-limit";

const storage = new MemoryStorage({
  cleanupIntervalMs: 60000  // Clean up expired entries every minute
});

const limiter = new RateLimiter(storage, {
  maxRequests: 100,
  windowMs: 60000
});
```

**Environment:**
```bash
RATE_LIMIT_STORAGE=memory
```

### Redis Storage

**Configuration:**
```typescript
import { RedisStorage, RateLimiter } from "@sim-corp/rate-limit";

const storage = new RedisStorage({
  url: process.env.REDIS_URL,
  // OR
  host: 'localhost',
  port: 6379,
  password: 'yourpassword',
  keyPrefix: 'ratelimit:'
});

const limiter = new RateLimiter(storage, {
  maxRequests: 100,
  windowMs: 60000
});
```

**Environment:**
```bash
RATE_LIMIT_STORAGE=redis
REDIS_URL=redis://localhost:6379
# OR
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=yourpassword
```

**Redis Setup with Docker:**
```bash
# Development
docker run -d -p 6379:6379 redis:7-alpine

# Production with persistence
docker run -d \
  -p 6379:6379 \
  -v redis-data:/data \
  redis:7-alpine redis-server --appendonly yes
```

## Rate Limit Strategies

### IP-Based Rate Limiting

Rate limit by client IP address. Best for public APIs and preventing abuse.

```typescript
import { IpRateLimitStrategy } from "@sim-corp/rate-limit";

const strategy = new IpRateLimitStrategy({
  maxRequests: 100,
  windowMs: 60000
});

// Extracts IP from:
// - request.ip
// - X-Forwarded-For header
// - X-Real-IP header
// - socket.remoteAddress
```

**Environment:**
```bash
RATE_LIMIT_STRATEGY=ip
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=60000
```

**Use cases:**
- Public REST APIs
- Preventing DDoS attacks
- Fair resource allocation

### User-Based Rate Limiting

Rate limit by authenticated user ID. Best for multi-tenant applications.

```typescript
import { UserRateLimitStrategy } from "@sim-corp/rate-limit";

const strategy = new UserRateLimitStrategy({
  maxRequests: 1000,  // Higher limit for authenticated users
  windowMs: 60000
});

// Extracts user ID from:
// - request.user.id
// - request.user.userId
// - request.userId
```

**Environment:**
```bash
RATE_LIMIT_STRATEGY=user
RATE_LIMIT_MAX_REQUESTS=1000
RATE_LIMIT_WINDOW_MS=60000
```

**Use cases:**
- SaaS applications
- Per-user quotas
- Fair usage policies

### Organization-Based Rate Limiting

Rate limit by organization/tenant ID. Best for B2B SaaS platforms.

```typescript
import { OrgRateLimitStrategy } from "@sim-corp/rate-limit";

const strategy = new OrgRateLimitStrategy({
  maxRequests: 10000,  // Per-organization limit
  windowMs: 60000
});

// Extracts org ID from:
// - request.user.orgId
// - request.orgId
// - request.organization.id
```

**Environment:**
```bash
RATE_LIMIT_STRATEGY=org
RATE_LIMIT_MAX_REQUESTS=10000
RATE_LIMIT_WINDOW_MS=60000
```

**Use cases:**
- Multi-tenant platforms
- Organization-level quotas
- Tiered pricing models

### API Key-Based Rate Limiting

Rate limit by API key. Best for external API consumers.

```typescript
import { ApiKeyRateLimitStrategy } from "@sim-corp/rate-limit";

const strategy = new ApiKeyRateLimitStrategy({
  maxRequests: 5000,
  windowMs: 60000
});

// Extracts API key from:
// - X-API-Key header
// - Authorization: Bearer <token> header
```

**Use cases:**
- Third-party API access
- Partner integrations
- Public API tiers

### Endpoint-Based Rate Limiting

Different rate limits for different endpoints.

```typescript
import { EndpointRateLimitStrategy } from "@sim-corp/rate-limit";

const endpointConfigs = new Map([
  ['/api/expensive', { maxRequests: 10, windowMs: 60000 }],
  ['/api/public/*', { maxRequests: 100, windowMs: 60000 }],
  ['/api/batch', { maxRequests: 5, windowMs: 60000 }]
]);

const strategy = new EndpointRateLimitStrategy(
  endpointConfigs,
  { maxRequests: 100, windowMs: 60000 } // default config
);
```

**Use cases:**
- Mixed endpoint requirements
- Protecting expensive operations
- Tiered API access

### Composite Strategy

Combine multiple strategies for layered protection.

```typescript
import {
  CompositeRateLimitStrategy,
  IpRateLimitStrategy,
  UserRateLimitStrategy
} from "@sim-corp/rate-limit";

const ipStrategy = new IpRateLimitStrategy({
  maxRequests: 100,
  windowMs: 60000
});

const userStrategy = new UserRateLimitStrategy({
  maxRequests: 1000,
  windowMs: 60000
});

// Rate limits must pass BOTH strategies (most restrictive wins)
const compositeStrategy = new CompositeRateLimitStrategy([
  ipStrategy,
  userStrategy
]);
```

**Use cases:**
- Defense in depth
- Multiple limiting dimensions
- Complex quota systems

## Fastify Integration

### Method 1: Global Plugin (Recommended)

Apply rate limiting to all routes:

```typescript
import { RateLimitFactory, FastifyRateLimitPlugin } from "@sim-corp/rate-limit";

const { rateLimiter, strategy } = RateLimitFactory.getInstance();
const rateLimitPlugin = new FastifyRateLimitPlugin(rateLimiter, strategy);

app.addHook('preHandler', async (request, reply) => {
  // Skip rate limiting for health checks and metrics
  if (request.url === '/health' || request.url === '/metrics') {
    return;
  }
  await rateLimitPlugin.createHook()(request, reply);
});

// Add metrics endpoint
app.get('/_rate-limit/metrics', async () => {
  return rateLimiter.getMetrics();
});
```

### Method 2: Route-Specific Handler

Apply rate limiting to specific routes:

```typescript
import { createRateLimitHandler, RateLimitFactory } from "@sim-corp/rate-limit";

const { rateLimiter, strategy } = RateLimitFactory.getInstance();
const rateLimitHandler = createRateLimitHandler(rateLimiter, strategy);

// Apply to specific routes
app.post('/api/expensive', {
  preHandler: rateLimitHandler
}, async (request, reply) => {
  // Your route logic
});
```

### Method 3: Custom Configuration per Route

Different limits for different routes:

```typescript
import { RateLimiter, MemoryStorage, IpRateLimitStrategy } from "@sim-corp/rate-limit";

const storage = new MemoryStorage();
const limiter = new RateLimiter(storage, {
  maxRequests: 100,
  windowMs: 60000
});

const strategy = new IpRateLimitStrategy({
  maxRequests: 100,
  windowMs: 60000
});

app.post('/api/expensive', {
  preHandler: async (request, reply) => {
    const key = strategy.getKey(request);
    const result = await limiter.check(key, {
      maxRequests: 10,  // Stricter limit
      windowMs: 60000
    });

    reply.header('X-RateLimit-Limit', result.info.limit.toString());
    reply.header('X-RateLimit-Remaining', result.info.remaining.toString());
    reply.header('X-RateLimit-Reset', result.info.resetAt.toISOString());

    if (!result.allowed) {
      reply.header('Retry-After', Math.ceil(result.info.resetMs / 1000).toString());
      return reply.status(429).send({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded for this endpoint',
        retryAfter: result.info.resetAt.toISOString()
      });
    }
  }
}, async (request, reply) => {
  // Your expensive operation
});
```

### Response Headers

The rate limiting middleware automatically adds standard rate limit headers:

```
X-RateLimit-Limit: 100          # Maximum requests allowed
X-RateLimit-Remaining: 42       # Requests remaining in window
X-RateLimit-Reset: 2026-01-12T... # When the limit resets
Retry-After: 45                 # Seconds until reset (when blocked)
```

### Error Response

When rate limit is exceeded:

```json
{
  "error": "Too Many Requests",
  "message": "Too many requests, please try again later.",
  "retryAfter": "2026-01-12T13:45:30.000Z"
}
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_STORAGE` | `memory` | Storage backend: `memory` or `redis` |
| `RATE_LIMIT_STRATEGY` | `ip` | Strategy: `ip`, `user`, or `org` |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Maximum requests per window |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Time window in milliseconds (1 minute) |
| `RATE_LIMIT_MESSAGE` | `"Too many requests..."` | Custom error message |
| `RATE_LIMIT_STATUS_CODE` | `429` | HTTP status code for blocked requests |
| `REDIS_URL` | - | Redis connection URL |
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | - | Redis password (optional) |

### Programmatic Configuration

```typescript
import { RateLimiter, MemoryStorage, IpRateLimitStrategy } from "@sim-corp/rate-limit";

const storage = new MemoryStorage({
  cleanupIntervalMs: 60000
});

const limiter = new RateLimiter(storage, {
  maxRequests: 100,
  windowMs: 60000,
  message: 'Custom rate limit message',
  statusCode: 429,

  // Optional: Skip rate limiting based on condition
  skip: async (key: string) => {
    return key.includes('trusted');
  },

  // Optional: Custom key generator
  keyGenerator: async (context: any) => {
    return `custom:${context.ip}:${context.user?.id}`;
  },

  // Optional: Callback when limit is reached
  onLimitReached: async (key: string, info: RateLimitInfo) => {
    console.warn(`Rate limit exceeded for ${key}`, info);
    // Send alert, log to monitoring, etc.
  }
});

const strategy = new IpRateLimitStrategy({
  maxRequests: 100,
  windowMs: 60000
});
```

### Token Bucket Configuration

```typescript
import { TokenBucket, MemoryStorage } from "@sim-corp/rate-limit";

const storage = new MemoryStorage();
const bucket = new TokenBucket(storage, {
  capacity: 100,           // Maximum tokens in bucket
  refillRate: 10,          // Tokens added per refill
  refillIntervalMs: 1000   // Refill every 1 second
});

// Consume tokens
const result = await bucket.consume('user123', 5);
if (result.allowed) {
  // Process request
  console.log(`Tokens remaining: ${result.remaining}`);
} else {
  // Reject request
  console.log(`Wait ${result.resetMs}ms for more tokens`);
}
```

## Monitoring & Metrics

### Built-in Metrics Endpoint

```bash
GET /_rate-limit/metrics
```

**Response:**
```json
{
  "totalRequests": 1523,
  "allowedRequests": 1498,
  "blockedRequests": 25,
  "activeKeys": 42,
  "blockRate": 0.0164
}
```

### Programmatic Metrics Access

```typescript
const metrics = await rateLimiter.getMetrics();

console.log(`Total requests: ${metrics.totalRequests}`);
console.log(`Blocked requests: ${metrics.blockedRequests}`);
console.log(`Block rate: ${(metrics.blockRate * 100).toFixed(2)}%`);
console.log(`Active keys: ${metrics.activeKeys}`);
```

### Integration with Prometheus

The rate limit metrics can be exposed alongside Prometheus metrics:

```typescript
import { initializeMetrics, createGauge, createCounter } from "@sim-corp/metrics";

// Create Prometheus metrics
const rateLimitBlockedTotal = createCounter({
  name: 'simcorp_rate_limit_blocked_total',
  help: 'Total number of requests blocked by rate limiter',
  labelNames: ['service'],
  registry: metricsRegistry,
});

const rateLimitActiveKeys = createGauge({
  name: 'simcorp_rate_limit_active_keys',
  help: 'Number of active rate limit keys',
  registry: metricsRegistry,
});

// Update metrics periodically
setInterval(async () => {
  const metrics = await rateLimiter.getMetrics();
  rateLimitBlockedTotal.inc(metrics.blockedRequests);
  rateLimitActiveKeys.set(metrics.activeKeys);
}, 10000);
```

### Logging

Monitor rate limit events:

```typescript
const limiter = new RateLimiter(storage, {
  maxRequests: 100,
  windowMs: 60000,
  onLimitReached: async (key: string, info: RateLimitInfo) => {
    app.log.warn({
      event: 'rate_limit_exceeded',
      key,
      current: info.current,
      limit: info.limit,
      resetAt: info.resetAt
    }, 'Rate limit exceeded');
  }
});
```

## Best Practices

### 1. Choose the Right Strategy

- **Public APIs**: Use IP-based rate limiting
- **Authenticated APIs**: Use user-based or org-based rate limiting
- **Mixed**: Use composite strategy for layered protection

### 2. Set Appropriate Limits

```typescript
// Development: Lenient limits
RATE_LIMIT_MAX_REQUESTS=1000
RATE_LIMIT_WINDOW_MS=60000

// Production: Stricter limits
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=60000

// Expensive operations: Very strict
RATE_LIMIT_MAX_REQUESTS=10
RATE_LIMIT_WINDOW_MS=60000
```

### 3. Skip Health Checks and Metrics

Always exclude health checks and metrics endpoints from rate limiting:

```typescript
app.addHook('preHandler', async (request, reply) => {
  if (request.url === '/health' ||
      request.url === '/metrics' ||
      request.url === '/_rate-limit/metrics') {
    return;
  }
  await rateLimitPlugin.createHook()(request, reply);
});
```

### 4. Use Redis in Production

For multi-node deployments, always use Redis storage:

```bash
# Production
RATE_LIMIT_STORAGE=redis
REDIS_URL=redis://redis.production.internal:6379

# Development
RATE_LIMIT_STORAGE=memory
```

### 5. Monitor Rate Limit Metrics

Set up alerts for high block rates:

```typescript
setInterval(async () => {
  const metrics = await rateLimiter.getMetrics();
  if (metrics.blockRate > 0.1) {  // More than 10% blocked
    // Send alert
    console.error('High rate limit block rate detected!');
  }
}, 60000);
```

### 6. Provide Clear Error Messages

```typescript
const limiter = new RateLimiter(storage, {
  maxRequests: 100,
  windowMs: 60000,
  message: 'API rate limit exceeded. Please try again in a few moments.',
  statusCode: 429
});
```

### 7. Use Token Bucket for Bursty Workloads

For file uploads, batch operations, or bursty traffic:

```typescript
const bucket = new TokenBucket(storage, {
  capacity: 100,      // Allow burst of 100 requests
  refillRate: 10,     // Replenish 10 requests per second
  refillIntervalMs: 1000
});
```

### 8. Test Rate Limiting

```typescript
import { describe, it, expect } from 'vitest';

describe('Rate Limiting', () => {
  it('should block requests exceeding limit', async () => {
    const app = await buildServer();

    // Make requests up to limit
    for (let i = 0; i < 100; i++) {
      const res = await app.inject({
        method: 'GET',
        url: '/api/test'
      });
      expect(res.statusCode).toBe(200);
    }

    // Next request should be blocked
    const blockedRes = await app.inject({
      method: 'GET',
      url: '/api/test'
    });
    expect(blockedRes.statusCode).toBe(429);
    expect(blockedRes.headers['retry-after']).toBeDefined();
  });
});
```

## Troubleshooting

### Issue: Rate limits not working

**Symptoms**: Requests never get blocked

**Solutions**:
1. Check environment variables are set correctly
2. Verify rate limiting middleware is registered before routes
3. Ensure strategy is extracting keys correctly
4. Check if `skip` function is accidentally allowing all requests

```typescript
// Debug: Log rate limit checks
const limiter = new RateLimiter(storage, {
  maxRequests: 100,
  windowMs: 60000,
  onLimitReached: (key, info) => {
    console.log('Rate limit hit:', key, info);
  }
});
```

### Issue: Different rate limits per instance

**Symptoms**: Rate limits behave differently on different servers

**Solutions**:
1. Use Redis storage instead of memory storage:
```bash
RATE_LIMIT_STORAGE=redis
REDIS_URL=redis://your-redis-host:6379
```

2. Ensure all instances connect to same Redis instance

### Issue: High memory usage with memory storage

**Symptoms**: Memory grows over time

**Solutions**:
1. Reduce cleanup interval:
```typescript
const storage = new MemoryStorage({
  cleanupIntervalMs: 30000  // Clean up every 30 seconds
});
```

2. Switch to Redis storage for production

### Issue: Redis connection errors

**Symptoms**: "ECONNREFUSED" or "Redis connection failed"

**Solutions**:
1. Verify Redis is running:
```bash
redis-cli ping  # Should return PONG
```

2. Check connection settings:
```bash
REDIS_URL=redis://localhost:6379  # Correct format
REDIS_HOST=localhost
REDIS_PORT=6379
```

3. Check firewall rules for Redis port

### Issue: Rate limits too strict

**Symptoms**: Legitimate users getting blocked

**Solutions**:
1. Increase limits:
```bash
RATE_LIMIT_MAX_REQUESTS=200  # Double the limit
RATE_LIMIT_WINDOW_MS=60000
```

2. Use different strategies for different user types:
```typescript
const strategy = new UserRateLimitStrategy({
  maxRequests: 1000,  // Higher for authenticated users
  windowMs: 60000
});
```

3. Implement tiered rate limits based on user role

### Issue: Missing rate limit headers

**Symptoms**: X-RateLimit-* headers not in response

**Solutions**:
1. Ensure middleware is properly configured
2. Check that handler is actually being called
3. Verify no other middleware is clearing headers

### Debugging Tips

1. **Enable verbose logging:**
```typescript
app.addHook('preHandler', async (request, reply) => {
  const key = strategy.getKey(request);
  app.log.info({ rateLimitKey: key }, 'Checking rate limit');

  const result = await limiter.check(key);
  app.log.info({
    allowed: result.allowed,
    remaining: result.info.remaining
  }, 'Rate limit result');

  if (!result.allowed) {
    app.log.warn({ key }, 'Rate limit exceeded');
  }
});
```

2. **Check current counts:**
```typescript
const count = await limiter.getCount('test-key');
console.log(`Current count for test-key: ${count}`);
```

3. **Reset specific keys for testing:**
```typescript
await limiter.reset('test-key');
```

4. **Inspect storage:**
```typescript
const keys = await storage.keys();
console.log('Active rate limit keys:', keys);
```

## Summary

The `@sim-corp/rate-limit` library provides flexible, production-ready rate limiting for Sim-Corp services:

- ✅ Multiple algorithms (sliding window, token bucket)
- ✅ Multiple storage backends (memory, Redis)
- ✅ Multiple strategies (IP, user, org, API key, endpoint)
- ✅ Fastify integration
- ✅ Built-in metrics and monitoring
- ✅ Environment-based configuration
- ✅ Comprehensive testing

For most services, the default configuration with IP-based rate limiting and memory storage is sufficient for development, while Redis storage should be used in production for distributed deployments.
