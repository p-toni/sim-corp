/**
 * Technical Readiness Checklist (35 points)
 *
 * Evaluates technical capabilities for L4 autonomy:
 * - Command performance (15 points)
 * - Safety & testing (10 points)
 * - Infrastructure (10 points)
 */

import type { ChecklistItem, AutonomyMetrics } from '@sim-corp/schemas/kernel/governance';

export interface TechnicalChecklistInputs {
  metrics: AutonomyMetrics;
  daysSincePhaseStart: number;
  evalCoverage: number;
  circuitBreakersImplemented: boolean;
  monitoringOperational: boolean;
  killSwitchTested: boolean;
  chaosTestsPassing: boolean;
}

/**
 * Evaluate technical readiness checklist
 */
export function evaluateTechnicalReadiness(inputs: TechnicalChecklistInputs): ChecklistItem[] {
  const { metrics, daysSincePhaseStart, evalCoverage } = inputs;

  return [
    // Command Performance (15 points)
    {
      name: '6+ months running at L3',
      weight: 5,
      required: true,
      status: daysSincePhaseStart >= 180,
      details: `Currently ${daysSincePhaseStart} days since phase start`,
    },
    {
      name: 'Command success rate >99.5%',
      weight: 5,
      required: true,
      status: metrics.rates.successRate > 0.995,
      details: `Current success rate: ${(metrics.rates.successRate * 100).toFixed(2)}%`,
    },
    {
      name: 'Command approval rate >80%',
      weight: 3,
      required: false,
      status: metrics.rates.approvalRate > 0.80,
      details: `Current approval rate: ${(metrics.rates.approvalRate * 100).toFixed(2)}%`,
    },
    {
      name: 'Rollback rate <2%',
      weight: 2,
      required: false,
      status: metrics.rates.rollbackRate < 0.02,
      details: `Current rollback rate: ${(metrics.rates.rollbackRate * 100).toFixed(2)}%`,
    },

    // Safety & Testing (10 points)
    {
      name: 'Eval coverage >90%',
      weight: 5,
      required: true,
      status: evalCoverage > 0.90,
      details: `Current eval coverage: ${(evalCoverage * 100).toFixed(1)}%`,
    },
    {
      name: 'Zero critical incidents from commands',
      weight: 5,
      required: true,
      status: metrics.incidents.fromAutonomousActions === 0,
      details: `Critical incidents from autonomous actions: ${metrics.incidents.fromAutonomousActions}`,
    },

    // Infrastructure (10 points)
    {
      name: 'Circuit breakers implemented',
      weight: 3,
      required: true,
      status: inputs.circuitBreakersImplemented,
      details: inputs.circuitBreakersImplemented ? 'Circuit breakers operational' : 'Circuit breakers not implemented',
    },
    {
      name: 'Real-time monitoring operational',
      weight: 3,
      required: true,
      status: inputs.monitoringOperational,
      details: inputs.monitoringOperational ? 'Monitoring operational' : 'Monitoring not operational',
    },
    {
      name: 'Kill switch tested',
      weight: 2,
      required: true,
      status: inputs.killSwitchTested,
      details: inputs.killSwitchTested ? 'Kill switch tested successfully' : 'Kill switch not tested',
    },
    {
      name: 'Chaos engineering tests passing',
      weight: 2,
      required: false,
      status: inputs.chaosTestsPassing,
      details: inputs.chaosTestsPassing ? 'Chaos tests passing' : 'Chaos tests not passing',
    },
  ];
}
