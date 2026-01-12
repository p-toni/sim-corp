/**
 * Metrics routes for governance service
 */

import type { FastifyInstance } from 'fastify';
import { TimeRangeSchema, AutonomyMetricsSchema } from '@sim-corp/schemas/kernel/governance';
import { createMetricsCollector } from '../metrics/collector.js';
import { MetricsSnapshotsRepo } from '../db/repo.js';

export async function metricsRoutes(fastify: FastifyInstance) {
  const collector = createMetricsCollector();
  const snapshotsRepo = new MetricsSnapshotsRepo();

  /**
   * GET /metrics/current - Get current metrics
   */
  fastify.get('/metrics/current', {
    schema: {
      querystring: TimeRangeSchema,
      response: {
        200: AutonomyMetricsSchema,
      },
    },
  }, async (request, reply) => {
    const { start, end } = request.query as { start: Date; end: Date };

    const metrics = await collector.collectAll({ start, end });

    // Save snapshot
    snapshotsRepo.save(metrics);

    return metrics;
  });

  /**
   * GET /metrics/latest - Get latest snapshot
   */
  fastify.get('/metrics/latest', {
    schema: {
      response: {
        200: AutonomyMetricsSchema.nullable(),
      },
    },
  }, async (request, reply) => {
    const latest = snapshotsRepo.getLatest();
    return latest;
  });

  /**
   * GET /metrics/weekly - Get weekly metrics (last 7 days)
   */
  fastify.get('/metrics/weekly', {
    schema: {
      response: {
        200: AutonomyMetricsSchema,
      },
    },
  }, async (request, reply) => {
    const end = new Date();
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

    const metrics = await collector.collectAll({ start, end });

    // Save snapshot
    snapshotsRepo.save(metrics);

    return metrics;
  });
}
