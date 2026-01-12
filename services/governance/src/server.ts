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
import { createHealthRoutes } from '@sim-corp/health';
import { initializeMetrics, metricsHandler } from '@sim-corp/metrics';
import { metricsRoutes } from './routes/metrics.js';

const PORT = parseInt(process.env.PORT || '4007', 10);
const HOST = process.env.HOST || '0.0.0.0';

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
});

// Initialize metrics
const httpMetrics = initializeMetrics({
  serviceName: 'governance',
  prefix: 'simcorp',
});

// Add metrics middleware
fastify.addHook('onRequest', httpMetrics.middleware('governance'));

// Health routes
fastify.register(createHealthRoutes, {
  serviceName: 'governance',
  version: '0.0.1',
});

// Prometheus metrics endpoint
fastify.get('/metrics', async () => {
  return metricsHandler();
});

// Governance routes
fastify.register(metricsRoutes, { prefix: '/api' });

/**
 * Start server
 */
async function start() {
  try {
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
