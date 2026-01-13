/**
 * Circuit breaker routes
 */

import type { FastifyInstance } from 'fastify';
import { CircuitBreakerEventSchema, CircuitBreakerRuleSchema } from '@sim-corp/schemas/kernel/governance';
import { CircuitBreakerEventsRepo, CircuitBreakerRulesRepo } from '../db/repo.js';

export async function circuitBreakerRoutes(fastify: FastifyInstance) {
  const eventsRepo = new CircuitBreakerEventsRepo();
  const rulesRepo = new CircuitBreakerRulesRepo();

  /**
   * GET /circuit-breaker/events - Get recent circuit breaker events
   */
  fastify.get('/circuit-breaker/events', {
    schema: {
      response: {
        200: {
          type: 'array',
          items: CircuitBreakerEventSchema,
        },
      },
    },
  }, async (request, reply) => {
    const events = eventsRepo.getRecent(20);
    return events;
  });

  /**
   * GET /circuit-breaker/events/unresolved - Get unresolved events
   */
  fastify.get('/circuit-breaker/events/unresolved', {
    schema: {
      response: {
        200: {
          type: 'array',
          items: CircuitBreakerEventSchema,
        },
      },
    },
  }, async (request, reply) => {
    const events = eventsRepo.getUnresolved();
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
    eventsRepo.resolve(id);
    return { success: true, id };
  });

  /**
   * GET /circuit-breaker/rules - Get all circuit breaker rules
   */
  fastify.get('/circuit-breaker/rules', {
    schema: {
      response: {
        200: {
          type: 'array',
          items: CircuitBreakerRuleSchema,
        },
      },
    },
  }, async (request, reply) => {
    const rules = rulesRepo.getAll();
    return rules;
  });

  /**
   * GET /circuit-breaker/rules/enabled - Get enabled rules
   */
  fastify.get('/circuit-breaker/rules/enabled', {
    schema: {
      response: {
        200: {
          type: 'array',
          items: CircuitBreakerRuleSchema,
        },
      },
    },
  }, async (request, reply) => {
    const rules = rulesRepo.getEnabled();
    return rules;
  });

  /**
   * PATCH /circuit-breaker/rules/:name - Update rule configuration
   */
  fastify.patch<{ Params: { name: string }; Body: any }>('/circuit-breaker/rules/:name', {
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

    rulesRepo.update(name, updates);

    return { success: true, name };
  });
}
