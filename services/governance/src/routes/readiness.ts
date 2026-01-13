/**
 * Readiness assessment routes
 */

import type { FastifyInstance } from 'fastify';
import { ReadinessReportSchema } from '@sim-corp/schemas/kernel/governance';
import { createReadinessAssessor } from '../readiness/assessor.js';
import { createMetricsCollector } from '../metrics/collector.js';
import { GovernanceStateRepo, ReadinessAssessmentsRepo } from '../db/repo.js';

export async function readinessRoutes(fastify: FastifyInstance) {
  const collector = createMetricsCollector();
  const stateRepo = new GovernanceStateRepo();
  const assessmentsRepo = new ReadinessAssessmentsRepo();

  /**
   * GET /readiness/current - Get current readiness assessment
   */
  fastify.get('/readiness/current', async (request, reply) => {
    // Get current governance state
    const state = stateRepo.getState();
    if (!state) {
      return reply.code(500).send({ error: 'Governance state not initialized' });
    }

    // Calculate days since phase start
    const daysSincePhaseStart = Math.floor(
      (Date.now() - state.phaseStartDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Collect recent metrics (last 30 days)
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    const metrics = await collector.collectAll({ start, end });

    // Create assessor and run assessment
    const assessor = await createReadinessAssessor(
      metrics,
      state.currentPhase,
      daysSincePhaseStart
    );

    const report = await assessor.assess();

    // Save assessment
    assessmentsRepo.save(report);

    return report;
  });

  /**
   * GET /readiness/latest - Get latest saved assessment
   */
  fastify.get('/readiness/latest', async (request, reply) => {
    const latest = assessmentsRepo.getLatest();
    return latest;
  });

  /**
   * GET /readiness/score - Get just the overall score
   */
  fastify.get('/readiness/score', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            score: { type: 'number' },
            ready: { type: 'boolean' },
            blockers: { type: 'array', items: { type: 'string' } },
            threshold: { type: 'number' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const latest = assessmentsRepo.getLatest();

    if (!latest) {
      // Run fresh assessment if none exists
      const state = stateRepo.getState();
      if (!state) {
        return reply.code(500).send({ error: 'Governance state not initialized' });
      }

      const daysSincePhaseStart = Math.floor(
        (Date.now() - state.phaseStartDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      const end = new Date();
      const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
      const metrics = await collector.collectAll({ start, end });

      const assessor = await createReadinessAssessor(
        metrics,
        state.currentPhase,
        daysSincePhaseStart
      );

      const report = await assessor.assess();
      assessmentsRepo.save(report);

      return {
        score: report.overall.score,
        ready: report.overall.ready,
        blockers: report.overall.blockers,
        threshold: 0.95,
      };
    }

    return {
      score: latest.overall.score,
      ready: latest.overall.ready,
      blockers: latest.overall.blockers,
      threshold: 0.95,
    };
  });
}
