/**
 * Governance agent routes
 */

import type { Database } from '@sim-corp/database';
import type { FastifyInstance } from 'fastify';
import { AutonomyGovernanceAgent } from '../agent/governance-agent.js';
import { GovernanceReportsRepo, GovernanceStateRepo, ScopeExpansionProposalsRepo } from '../db/repo.js';

export async function governanceRoutes(fastify: FastifyInstance, db: Database) {
  const reportsRepo = new GovernanceReportsRepo(db);
  const stateRepo = new GovernanceStateRepo(db);
  const proposalsRepo = new ScopeExpansionProposalsRepo(db);

  /**
   * POST /governance/run-cycle - Run weekly governance cycle
   */
  fastify.post('/governance/run-cycle', async (request, reply) => {
    const agent = new AutonomyGovernanceAgent(db);
    const report = await agent.runWeeklyCycle();
    await agent.close();

    return report;
  });

  /**
   * GET /governance/reports - Get governance reports
   */
  fastify.get('/governance/reports', async (request, reply) => {
    const { limit = 10 } = request.query as { limit?: number };
    const reports = await reportsRepo.getAll(limit);
    return reports;
  });

  /**
   * GET /governance/reports/latest - Get latest report
   */
  fastify.get('/governance/reports/latest', async (request, reply) => {
    const report = await reportsRepo.getLatest();
    return report;
  });

  /**
   * GET /governance/reports/:id - Get report by ID
   */
  fastify.get<{ Params: { id: string } }>('/governance/reports/:id', async (request, reply) => {
    const { id } = request.params;
    const report = await reportsRepo.getById(id);
    return report;
  });

  /**
   * GET /governance/state - Get current governance state
   */
  fastify.get('/governance/state', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            currentPhase: { type: 'string' },
            phaseStartDate: { type: 'string' },
            commandWhitelist: { type: 'array', items: { type: 'string' } },
            daysSincePhaseStart: { type: 'number' },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const state = await stateRepo.getState();
    if (!state) {
      return reply.code(404).send({ error: 'Governance state not found' });
    }

    const daysSincePhaseStart = Math.floor(
      (Date.now() - state.phaseStartDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      currentPhase: state.currentPhase,
      phaseStartDate: state.phaseStartDate.toISOString(),
      commandWhitelist: state.commandWhitelist,
      daysSincePhaseStart,
    };
  });

  /**
   * GET /governance/proposals - Get scope expansion proposals
   */
  fastify.get('/governance/proposals', async (request, reply) => {
    const proposals = await proposalsRepo.getPending();
    return proposals;
  });

  /**
   * POST /governance/proposals/:id/approve - Approve proposal
   */
  fastify.post<{ Params: { id: string }; Body: { approvedBy: string } }>('/governance/proposals/:id/approve', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
      body: {
        type: 'object',
        properties: {
          approvedBy: { type: 'string' },
        },
        required: ['approvedBy'],
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { approvedBy } = request.body;

    await proposalsRepo.approve(id, approvedBy);

    // TODO: Update governance state with new whitelist

    return { success: true, id, approvedBy };
  });

  /**
   * POST /governance/proposals/:id/reject - Reject proposal
   */
  fastify.post<{ Params: { id: string } }>('/governance/proposals/:id/reject', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    await proposalsRepo.reject(id);

    return { success: true, id };
  });
}
