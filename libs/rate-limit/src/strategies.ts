import type { RateLimitStrategy, RateLimitConfig } from './interfaces';

/**
 * Rate limit by IP address
 */
export class IpRateLimitStrategy implements RateLimitStrategy {
  name = 'ip';

  constructor(private readonly config: RateLimitConfig) {}

  getKey(context: any): string {
    // Extract IP from request context
    const ip =
      context.ip ||
      context.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
      context.headers?.['x-real-ip'] ||
      context.socket?.remoteAddress ||
      'unknown';

    return `ip:${ip}`;
  }

  getConfig(): RateLimitConfig {
    return this.config;
  }
}

/**
 * Rate limit by user ID (authenticated requests)
 */
export class UserRateLimitStrategy implements RateLimitStrategy {
  name = 'user';

  constructor(private readonly config: RateLimitConfig) {}

  getKey(context: any): string {
    // Extract user ID from authenticated context
    const userId =
      context.user?.id ||
      context.user?.userId ||
      context.userId ||
      'anonymous';

    return `user:${userId}`;
  }

  getConfig(): RateLimitConfig {
    return this.config;
  }
}

/**
 * Rate limit by organization ID (multi-tenant)
 */
export class OrgRateLimitStrategy implements RateLimitStrategy {
  name = 'org';

  constructor(private readonly config: RateLimitConfig) {}

  getKey(context: any): string {
    // Extract org ID from authenticated context
    const orgId =
      context.user?.orgId ||
      context.orgId ||
      context.organization?.id ||
      'no-org';

    return `org:${orgId}`;
  }

  getConfig(): RateLimitConfig {
    return this.config;
  }
}

/**
 * Rate limit by API key
 */
export class ApiKeyRateLimitStrategy implements RateLimitStrategy {
  name = 'apikey';

  constructor(private readonly config: RateLimitConfig) {}

  getKey(context: any): string {
    // Extract API key from headers
    const apiKey =
      context.headers?.['x-api-key'] ||
      context.headers?.['authorization']?.replace(/^Bearer\s+/, '') ||
      'no-key';

    // Hash long API keys for storage efficiency
    if (apiKey.length > 32) {
      return `apikey:${this.simpleHash(apiKey)}`;
    }

    return `apikey:${apiKey}`;
  }

  getConfig(): RateLimitConfig {
    return this.config;
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }
}

/**
 * Rate limit by endpoint (URL path)
 */
export class EndpointRateLimitStrategy implements RateLimitStrategy {
  name = 'endpoint';

  constructor(
    private readonly endpointConfigs: Map<string, RateLimitConfig>,
    private readonly defaultConfig: RateLimitConfig
  ) {}

  getKey(context: any): string {
    const path = context.url || context.path || context.routerPath || '/';

    // Extract base path (remove query string)
    const basePath = path.split('?')[0];

    return `endpoint:${basePath}`;
  }

  getConfig(context: any): RateLimitConfig {
    const path = context.url || context.path || context.routerPath || '/';
    const basePath = path.split('?')[0];

    // Check for exact match first
    if (this.endpointConfigs.has(basePath)) {
      return this.endpointConfigs.get(basePath)!;
    }

    // Check for pattern matches (e.g., /api/*)
    for (const [pattern, config] of this.endpointConfigs.entries()) {
      if (this.matchPattern(basePath, pattern)) {
        return config;
      }
    }

    return this.defaultConfig;
  }

  private matchPattern(path: string, pattern: string): boolean {
    // Simple wildcard matching (* at end)
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return path.startsWith(prefix);
    }

    // Exact match
    return path === pattern;
  }
}

/**
 * Composite strategy that applies multiple strategies
 */
export class CompositeRateLimitStrategy implements RateLimitStrategy {
  name = 'composite';

  constructor(private readonly strategies: RateLimitStrategy[]) {}

  async getKey(context: any): Promise<string> {
    const keys = await Promise.all(
      this.strategies.map(s => s.getKey(context))
    );
    return keys.join(':');
  }

  async getConfig(context: any): Promise<RateLimitConfig> {
    // Use the most restrictive config (lowest maxRequests)
    const configs = await Promise.all(
      this.strategies.map(s => s.getConfig(context))
    );

    return configs.reduce((mostRestrictive, current) => {
      if (current.maxRequests < mostRestrictive.maxRequests) {
        return current;
      }
      return mostRestrictive;
    });
  }
}
