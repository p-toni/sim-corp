/**
 * @sim-corp/metrics
 *
 * Shared Prometheus metrics instrumentation library for all Sim-Corp services.
 * Provides standard RED metrics (Rate, Errors, Duration) and process metrics.
 */

import { register, collectDefaultMetrics, Registry, Counter, Histogram, Gauge, Summary } from 'prom-client';
import type { FastifyRequest, FastifyReply } from 'fastify';

// Export prom-client types for service-specific metrics
export { Counter, Histogram, Gauge, Summary, Registry, register };

/**
 * MetricsConfig - Configuration for metrics instrumentation
 */
export interface MetricsConfig {
  /** Service name (used as label) */
  serviceName: string;
  /** Whether to collect default Node.js process metrics */
  collectDefaultMetrics?: boolean;
  /** Custom registry (optional, defaults to global registry) */
  registry?: Registry;
  /** Prefix for all metric names (optional) */
  prefix?: string;
}

/**
 * Standard HTTP metrics for all services
 */
export class HttpMetrics {
  private requestsTotal: Counter;
  private requestDuration: Histogram;
  private requestsInProgress: Gauge;

  constructor(config: MetricsConfig) {
    const registry = config.registry || register;
    const prefix = config.prefix || 'simcorp';

    // Total HTTP requests by method, route, status
    this.requestsTotal = new Counter({
      name: `${prefix}_http_requests_total`,
      help: 'Total number of HTTP requests',
      labelNames: ['service', 'method', 'route', 'status_code'],
      registers: [registry],
    });

    // HTTP request duration in seconds
    this.requestDuration = new Histogram({
      name: `${prefix}_http_request_duration_seconds`,
      help: 'HTTP request duration in seconds',
      labelNames: ['service', 'method', 'route', 'status_code'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [registry],
    });

    // Current in-flight requests
    this.requestsInProgress = new Gauge({
      name: `${prefix}_http_requests_in_progress`,
      help: 'Number of HTTP requests currently being processed',
      labelNames: ['service', 'method', 'route'],
      registers: [registry],
    });
  }

  /**
   * Fastify middleware to instrument HTTP requests
   */
  middleware(serviceName: string) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const route = request.routeOptions.url || request.url;
      const method = request.method;

      // Start timer
      const end = this.requestDuration.startTimer({
        service: serviceName,
        method,
        route,
      });

      // Increment in-progress gauge
      this.requestsInProgress.inc({ service: serviceName, method, route });

      // Wait for response to finish
      reply.raw.on('finish', () => {
        const statusCode = reply.statusCode.toString();

        // Record duration
        end({ status_code: statusCode });

        // Increment total counter
        this.requestsTotal.inc({
          service: serviceName,
          method,
          route,
          status_code: statusCode,
        });

        // Decrement in-progress gauge
        this.requestsInProgress.dec({ service: serviceName, method, route });
      });
    };
  }
}

/**
 * Initialize metrics for a service
 */
export function initializeMetrics(config: MetricsConfig): HttpMetrics {
  const registry = config.registry || register;

  // Collect default Node.js metrics (memory, CPU, event loop, etc.)
  if (config.collectDefaultMetrics !== false) {
    collectDefaultMetrics({
      register: registry,
      prefix: config.prefix || 'simcorp_',
      labels: { service: config.serviceName },
    });
  }

  return new HttpMetrics(config);
}

/**
 * Handler for /metrics endpoint
 */
export async function metricsHandler(registry: Registry = register): Promise<string> {
  return registry.metrics();
}

/**
 * Create a counter metric
 */
export function createCounter(opts: {
  name: string;
  help: string;
  labelNames?: string[];
  registry?: Registry;
}) {
  return new Counter({
    name: opts.name,
    help: opts.help,
    labelNames: opts.labelNames || [],
    registers: [opts.registry || register],
  });
}

/**
 * Create a gauge metric
 */
export function createGauge(opts: {
  name: string;
  help: string;
  labelNames?: string[];
  registry?: Registry;
}) {
  return new Gauge({
    name: opts.name,
    help: opts.help,
    labelNames: opts.labelNames || [],
    registers: [opts.registry || register],
  });
}

/**
 * Create a histogram metric
 */
export function createHistogram(opts: {
  name: string;
  help: string;
  labelNames?: string[];
  buckets?: number[];
  registry?: Registry;
}) {
  return new Histogram({
    name: opts.name,
    help: opts.help,
    labelNames: opts.labelNames || [],
    buckets: opts.buckets || [0.001, 0.01, 0.1, 1, 10],
    registers: [opts.registry || register],
  });
}

/**
 * Create a summary metric
 */
export function createSummary(opts: {
  name: string;
  help: string;
  labelNames?: string[];
  percentiles?: number[];
  registry?: Registry;
}) {
  return new Summary({
    name: opts.name,
    help: opts.help,
    labelNames: opts.labelNames || [],
    percentiles: opts.percentiles || [0.5, 0.9, 0.95, 0.99],
    registers: [opts.registry || register],
  });
}
