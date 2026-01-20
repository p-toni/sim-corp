/**
 * Circuit breaker routes
 */

import type { Database } from '@sim-corp/database';
import type { FastifyInstance } from 'fastify';
import type { CircuitBreakerRule } from '@sim-corp/schemas/kernel/governance';
import { CircuitBreakerEventsRepo, CircuitBreakerRulesRepo } from '../db/repo.js';

export async function circuitBreakerRoutes(fastify: FastifyInstance, db: Database) {
  const eventsRepo = new CircuitBreakerEventsRepo(db);
  const rulesRepo = new CircuitBreakerRulesRepo(db);

  /**
   * GET /circuit-breaker/events - Get recent circuit breaker events
   */
  fastify.get('/circuit-breaker/events', async (request, reply) => {
    const events = await eventsRepo.getRecent(20);
    return events;
  });

  /**
   * GET /circuit-breaker/events/unresolved - Get unresolved events
   */
  fastify.get('/circuit-breaker/events/unresolved', async (request, reply) => {
    const events = await eventsRepo.getUnresolved();
    return events;
  });

  /**
   * POST /circuit-breaker/events/:id/resolve - Mark event as resolved
   */
  fastify.post<{ Params: { id: string } }>('/circuit-breaker/events/:id/resolve', {
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
    await eventsRepo.resolve(id);
    return { success: true, id };
  });

  /**
   * GET /circuit-breaker/rules - Get all circuit breaker rules
   */
  fastify.get('/circuit-breaker/rules', async (request, reply) => {
    const rules = await rulesRepo.getAll();
    return rules;
  });

  /**
   * GET /circuit-breaker/rules/enabled - Get enabled rules
   */
  fastify.get('/circuit-breaker/rules/enabled', async (request, reply) => {
    const rules = await rulesRepo.getEnabled();
    return rules;
  });

  /**
   * PATCH /circuit-breaker/rules/:name - Update rule configuration
   */
  fastify.patch<{ Params: { name: string }; Body: Partial<CircuitBreakerRule> }>('/circuit-breaker/rules/:name', {
    schema: {
      params: {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      },
      body: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          condition: { type: 'string' },
          window: { type: 'string' },
          action: { type: 'string', enum: ['revert_to_l3', 'pause_command_type', 'alert_only'] },
          alertSeverity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
        },
      },
    },
  }, async (request, reply) => {
    const { name } = request.params;
    const updates = request.body;

    await rulesRepo.update(name, updates);

    return { success: true, name };
  });
}
