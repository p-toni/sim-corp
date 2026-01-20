/**
 * Governance Service - Autonomy Governance & Circuit Breakers
 *
 * Provides:
 * - Autonomy metrics collection
 * - Readiness assessment
 * - Circuit breaker monitoring
 * - Governance agent workflow
 */

import Fastify from 'fastify';
import { registerHealthChecks } from '@sim-corp/health';
import { initializeMetrics, metricsHandler } from '@sim-corp/metrics';
import { getDatabase } from './db/database.js';
import { metricsRoutes } from './routes/metrics.js';
import { createMetricsExporter } from './metrics/exporter.js';

const PORT = parseInt(process.env.PORT || '4007', 10);
const HOST = process.env.HOST || '0.0.0.0';

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
});

// Import route functions
import { readinessRoutes } from './routes/readiness.js';
import { circuitBreakerRoutes } from './routes/circuit-breaker.js';
import { governanceRoutes } from './routes/governance.js';
import { createCircuitBreaker } from './circuit-breaker/breaker.js';

// Initialize HTTP metrics
const httpMetrics = initializeMetrics({
  serviceName: 'governance',
  prefix: 'simcorp',
});

// Add metrics middleware
fastify.addHook('onRequest', httpMetrics.middleware('governance'));

// Health routes
registerHealthChecks(fastify, {
  serviceName: 'governance',
});

// Prometheus metrics endpoint
fastify.get('/metrics', async () => {
  return metricsHandler();
});

/**
 * Start server
 */
async function start() {
  try {
    // Initialize database
    console.log('[Governance] Initializing database...');
    const db = await getDatabase();
    console.log(`[Governance] Database initialized (type: ${db.type})`);

    // Register routes with database
    await fastify.register(async (instance) => {
      await metricsRoutes(instance, db);
    }, { prefix: '/api' });

    await fastify.register(async (instance) => {
      await readinessRoutes(instance, db);
    }, { prefix: '/api' });

    await fastify.register(async (instance) => {
      await circuitBreakerRoutes(instance, db);
    }, { prefix: '/api' });

    await fastify.register(async (instance) => {
      await governanceRoutes(instance, db);
    }, { prefix: '/api' });

    // Initialize governance-specific metrics
    console.log('[Governance] Initializing metrics exporter...');
    const governanceMetrics = createMetricsExporter(db);
    governanceMetrics.startPeriodicUpdates(30000); // Update every 30 seconds

    // Start circuit breaker monitoring
    console.log('[Governance] Starting circuit breaker...');
    const circuitBreaker = createCircuitBreaker(db);
    circuitBreaker.start();

    // Start listening
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`[Governance] Server listening on ${HOST}:${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
process.on('SIGTERM', async () => {
  console.log('[Governance] SIGTERM received, shutting down gracefully...');
  await fastify.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Governance] SIGINT received, shutting down gracefully...');
  await fastify.close();
  process.exit(0);
});

start();
