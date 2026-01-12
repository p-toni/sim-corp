import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import type { RateLimitStrategy, RateLimitConfig } from './interfaces';
import { RateLimiter } from './rate-limiter';
import { MemoryStorage } from './memory-storage';

/**
 * Fastify plugin for rate limiting
 */
export class FastifyRateLimitPlugin {
  private rateLimiter: RateLimiter;
  private strategy: RateLimitStrategy;

  constructor(
    rateLimiter: RateLimiter,
    strategy: RateLimitStrategy
  ) {
    this.rateLimiter = rateLimiter;
    this.strategy = strategy;
  }

  /**
   * Create Fastify hook for rate limiting
   */
  createHook() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Get rate limit key and config from strategy
        const key = await this.strategy.getKey(request);
        const config = await this.strategy.getConfig(request);

        // Check rate limit
        const result = await this.rateLimiter.check(key, config);

        // Add rate limit headers
        reply.header('X-RateLimit-Limit', result.info.limit.toString());
        reply.header('X-RateLimit-Remaining', result.info.remaining.toString());
        reply.header('X-RateLimit-Reset', result.info.resetAt.toISOString());

        if (!result.allowed) {
          // Rate limit exceeded
          reply.header('Retry-After', Math.ceil(result.info.resetMs / 1000).toString());

          const statusCode = config.statusCode ?? 429;
          const message = config.message ?? 'Too many requests, please try again later.';

          return reply.status(statusCode).send({
            error: 'Too Many Requests',
            message,
            retryAfter: result.info.resetAt.toISOString()
          });
        }
      } catch (error) {
        // Log error but don't block request on rate limiter failure
        request.log.error({ error }, 'Rate limiter error');
      }
    };
  }

  /**
   * Register plugin with Fastify instance
   */
  static async register(
    app: FastifyInstance,
    options: {
      rateLimiter?: RateLimiter;
      strategy: RateLimitStrategy;
      config?: RateLimitConfig;
    }
  ) {
    // Create rate limiter if not provided
    const rateLimiter = options.rateLimiter ?? new RateLimiter(
      new MemoryStorage(),
      options.config ?? {
        maxRequests: 100,
        windowMs: 60000 // 1 minute
      }
    );

    const plugin = new FastifyRateLimitPlugin(rateLimiter, options.strategy);

    // Register pre-handler hook
    app.addHook('preHandler', plugin.createHook());

    // Add metrics endpoint (optional)
    app.get('/_rate-limit/metrics', async () => {
      return rateLimiter.getMetrics();
    });

    return plugin;
  }
}

/**
 * Helper to create rate limit middleware for specific routes
 */
export function createRateLimitHandler(
  rateLimiter: RateLimiter,
  strategy: RateLimitStrategy
) {
  const plugin = new FastifyRateLimitPlugin(rateLimiter, strategy);
  return plugin.createHook();
}
