import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { MqttClient } from 'mqtt';
import { Database } from 'better-sqlite3';

/**
 * Health check result for a single dependency
 */
export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  message?: string;
  latency?: number;
}

/**
 * Overall health status response
 */
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  checks: Record<string, HealthCheckResult>;
}

/**
 * Dependency checker function type
 */
export type DependencyChecker = () => Promise<HealthCheckResult>;

/**
 * Health check options
 */
export interface HealthCheckOptions {
  serviceName: string;
  dependencies?: Record<string, DependencyChecker>;
  includeSystemMetrics?: boolean;
}

/**
 * Graceful shutdown options
 */
export interface GracefulShutdownOptions {
  timeout?: number; // Timeout in milliseconds (default: 10000)
  signals?: NodeJS.Signals[]; // Signals to listen for (default: SIGTERM, SIGINT)
  logger?: {
    info: (msg: string) => void;
    error: (msg: string) => void;
  };
}

/**
 * Database health checker
 */
export function createDatabaseChecker(db: Database | (() => Database)): DependencyChecker {
  return async (): Promise<HealthCheckResult> => {
    const startTime = Date.now();
    try {
      const database = typeof db === 'function' ? db() : db;

      // Simple query to check database connectivity
      const result = database.prepare('SELECT 1 as health').get() as { health: number };

      if (result.health !== 1) {
        return {
          status: 'unhealthy',
          message: 'Database query returned unexpected result',
          latency: Date.now() - startTime,
        };
      }

      return {
        status: 'healthy',
        latency: Date.now() - startTime,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Database health check failed',
        latency: Date.now() - startTime,
      };
    }
  };
}

/**
 * MQTT health checker
 */
export function createMqttChecker(client: MqttClient | (() => MqttClient)): DependencyChecker {
  return async (): Promise<HealthCheckResult> => {
    const startTime = Date.now();
    try {
      const mqttClient = typeof client === 'function' ? client() : client;

      if (!mqttClient.connected) {
        return {
          status: 'unhealthy',
          message: 'MQTT client not connected',
          latency: Date.now() - startTime,
        };
      }

      return {
        status: 'healthy',
        latency: Date.now() - startTime,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'MQTT health check failed',
        latency: Date.now() - startTime,
      };
    }
  };
}

/**
 * HTTP upstream service health checker
 */
export function createHttpChecker(url: string, options?: { timeout?: number }): DependencyChecker {
  return async (): Promise<HealthCheckResult> => {
    const startTime = Date.now();
    const timeout = options?.timeout ?? 5000;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          status: 'unhealthy',
          message: `HTTP ${response.status}: ${response.statusText}`,
          latency: Date.now() - startTime,
        };
      }

      return {
        status: 'healthy',
        latency: Date.now() - startTime,
      };
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          return {
            status: 'unhealthy',
            message: `Request timeout after ${timeout}ms`,
            latency: Date.now() - startTime,
          };
        }
        return {
          status: 'unhealthy',
          message: error.message,
          latency: Date.now() - startTime,
        };
      }
      return {
        status: 'unhealthy',
        message: 'HTTP health check failed',
        latency: Date.now() - startTime,
      };
    }
  };
}

/**
 * Get system metrics for health check
 */
function getSystemMetrics(): Record<string, HealthCheckResult> {
  const memUsage = process.memoryUsage();
  const uptime = process.uptime();

  return {
    memory: {
      status: 'healthy',
      message: `RSS: ${Math.round(memUsage.rss / 1024 / 1024)}MB, Heap: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
    },
    uptime: {
      status: 'healthy',
      message: `${Math.round(uptime)}s`,
    },
  };
}

/**
 * Execute all health checks
 */
async function executeHealthChecks(
  dependencies: Record<string, DependencyChecker>,
  includeSystemMetrics: boolean
): Promise<Record<string, HealthCheckResult>> {
  const checks: Record<string, HealthCheckResult> = {};

  // Execute dependency checks in parallel
  const entries = Object.entries(dependencies);
  const results = await Promise.all(
    entries.map(async ([name, checker]) => {
      try {
        const result = await checker();
        return [name, result] as const;
      } catch (error) {
        return [
          name,
          {
            status: 'unhealthy' as const,
            message: error instanceof Error ? error.message : 'Health check failed',
          },
        ] as const;
      }
    })
  );

  // Collect results
  for (const [name, result] of results) {
    checks[name] = result;
  }

  // Add system metrics if requested
  if (includeSystemMetrics) {
    Object.assign(checks, getSystemMetrics());
  }

  return checks;
}

/**
 * Determine overall health status from individual checks
 */
function determineOverallStatus(checks: Record<string, HealthCheckResult>): 'healthy' | 'degraded' | 'unhealthy' {
  const statuses = Object.values(checks).map(c => c.status);

  if (statuses.every(s => s === 'healthy')) {
    return 'healthy';
  }

  if (statuses.some(s => s === 'unhealthy')) {
    // Check if critical dependencies are unhealthy
    const criticalDeps = ['database', 'mqtt'];
    const criticalUnhealthy = Object.entries(checks).some(
      ([name, check]) => criticalDeps.includes(name) && check.status === 'unhealthy'
    );

    return criticalUnhealthy ? 'unhealthy' : 'degraded';
  }

  return 'healthy';
}

/**
 * Register health check endpoints on Fastify instance
 *
 * /health - Liveness probe (always returns 200 if service is running)
 * /ready - Readiness probe (checks dependencies)
 */
export function registerHealthChecks(
  app: FastifyInstance,
  options: HealthCheckOptions
): void {
  const { serviceName, dependencies = {}, includeSystemMetrics = true } = options;
  const startTime = Date.now();

  // Liveness probe - simple check that service is running
  app.get('/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    const uptime = (Date.now() - startTime) / 1000;

    reply.status(200).send({
      status: 'healthy',
      service: serviceName,
      timestamp: new Date().toISOString(),
      uptime,
    });
  });

  // Readiness probe - checks dependencies
  app.get('/ready', async (_request: FastifyRequest, reply: FastifyReply) => {
    const uptime = (Date.now() - startTime) / 1000;
    const checks = await executeHealthChecks(dependencies, includeSystemMetrics);
    const overallStatus = determineOverallStatus(checks);

    const response: HealthStatus = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime,
      checks,
    };

    // Return 200 for healthy/degraded, 503 for unhealthy
    const statusCode = overallStatus === 'unhealthy' ? 503 : 200;
    reply.status(statusCode).send(response);
  });
}

/**
 * Setup graceful shutdown handlers
 */
export function setupGracefulShutdown(
  app: FastifyInstance,
  options: GracefulShutdownOptions = {}
): void {
  const {
    timeout = 10000,
    signals = ['SIGTERM', 'SIGINT'],
    logger = console,
  } = options;

  let isShuttingDown = false;

  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      logger.info('Shutdown already in progress, ignoring signal');
      return;
    }

    isShuttingDown = true;
    logger.info(`Received ${signal}, starting graceful shutdown...`);

    // Set a timeout for the shutdown process
    const shutdownTimeout = setTimeout(() => {
      logger.error(`Graceful shutdown timed out after ${timeout}ms, forcing exit`);
      process.exit(1);
    }, timeout);

    try {
      // Close the Fastify server
      await app.close();
      logger.info('Server closed successfully');

      clearTimeout(shutdownTimeout);
      process.exit(0);
    } catch (error) {
      logger.error(`Error during shutdown: ${error instanceof Error ? error.message : 'Unknown error'}`);
      clearTimeout(shutdownTimeout);
      process.exit(1);
    }
  };

  // Register signal handlers
  for (const signal of signals) {
    process.on(signal, () => shutdown(signal));
  }

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error(`Uncaught exception: ${error.message}`);
    shutdown('uncaughtException');
  });

  // Handle unhandled rejections
  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled rejection: ${reason}`);
    shutdown('unhandledRejection');
  });
}

/**
 * Convenience function to setup both health checks and graceful shutdown
 */
export function setupHealthAndShutdown(
  app: FastifyInstance,
  healthOptions: HealthCheckOptions,
  shutdownOptions?: GracefulShutdownOptions
): void {
  registerHealthChecks(app, healthOptions);
  if (shutdownOptions !== undefined) {
    setupGracefulShutdown(app, shutdownOptions);
  }
}
