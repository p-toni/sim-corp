/**
 * Tests for CircuitBreaker and rule evaluation
 */

import { describe, it, expect } from 'vitest';
import { evaluateRule, parseTimeWindow } from '../src/circuit-breaker/rules.js';
import type { CircuitBreakerRule, AutonomyMetrics } from '@sim-corp/schemas/kernel/governance';

// Helper to create test metrics
function createTestMetrics(overrides?: Partial<AutonomyMetrics>): AutonomyMetrics {
  return {
    period: {
      start: new Date('2024-01-01'),
      end: new Date('2024-01-31'),
    },
    commands: {
      total: 100,
      proposed: 100,
      approved: 85,
      rejected: 15,
      succeeded: 80,
      failed: 5,
      rolledBack: 2,
    },
    rates: {
      successRate: 0.9412,
      approvalRate: 0.85,
      rollbackRate: 0.025,
      errorRate: 0.05,
    },
    incidents: {
      total: 0,
      critical: 0,
      fromAutonomousActions: 0,
    },
    safety: {
      constraintViolations: 3,
      emergencyAborts: 0,
      safetyGateTriggers: 1,
    },
    ...overrides,
  };
}

describe('CircuitBreaker Rule Evaluation', () => {
  describe('parseTimeWindow', () => {
    it('should parse seconds', () => {
      expect(parseTimeWindow('30s')).toBe(30 * 1000);
    });

    it('should parse minutes', () => {
      expect(parseTimeWindow('5m')).toBe(5 * 60 * 1000);
    });

    it('should parse hours', () => {
      expect(parseTimeWindow('2h')).toBe(2 * 60 * 60 * 1000);
    });

    it('should parse days', () => {
      expect(parseTimeWindow('1d')).toBe(24 * 60 * 60 * 1000);
    });

    it('should throw on invalid format', () => {
      expect(() => parseTimeWindow('invalid')).toThrow();
    });
  });

  describe('evaluateRule', () => {
    it('should not trigger disabled rules', () => {
      const rule: CircuitBreakerRule = {
        name: 'Test Rule',
        enabled: false,
        condition: 'errorRate > 0.05',
        window: '5m',
        action: 'alert_only',
        alertSeverity: 'low',
      };

      const metrics = createTestMetrics({ rates: { ...createTestMetrics().rates, errorRate: 0.10 } });

      expect(evaluateRule(rule, metrics)).toBe(false);
    });

    it('should trigger on high error rate', () => {
      const rule: CircuitBreakerRule = {
        name: 'High Error Rate',
        enabled: true,
        condition: 'errorRate > 0.05',
        window: '5m',
        action: 'revert_to_l3',
        alertSeverity: 'critical',
      };

      const metrics = createTestMetrics({ rates: { ...createTestMetrics().rates, errorRate: 0.10 } });

      expect(evaluateRule(rule, metrics)).toBe(true);
    });

    it('should not trigger when error rate is below threshold', () => {
      const rule: CircuitBreakerRule = {
        name: 'High Error Rate',
        enabled: true,
        condition: 'errorRate > 0.05',
        window: '5m',
        action: 'revert_to_l3',
        alertSeverity: 'critical',
      };

      const metrics = createTestMetrics({ rates: { ...createTestMetrics().rates, errorRate: 0.02 } });

      expect(evaluateRule(rule, metrics)).toBe(false);
    });

    it('should trigger on high rollback rate', () => {
      const rule: CircuitBreakerRule = {
        name: 'High Rollback Rate',
        enabled: true,
        condition: 'rollbackRate > 0.1',
        window: '15m',
        action: 'alert_only',
        alertSeverity: 'medium',
      };

      const metrics = createTestMetrics({ rates: { ...createTestMetrics().rates, rollbackRate: 0.15 } });

      expect(evaluateRule(rule, metrics)).toBe(true);
    });

    it('should trigger on low success rate', () => {
      const rule: CircuitBreakerRule = {
        name: 'Low Success Rate',
        enabled: true,
        condition: 'successRate < 0.95',
        window: '5m',
        action: 'revert_to_l3',
        alertSeverity: 'critical',
      };

      const metrics = createTestMetrics({ rates: { ...createTestMetrics().rates, successRate: 0.90 } });

      expect(evaluateRule(rule, metrics)).toBe(true);
    });

    it('should trigger on critical incident', () => {
      const rule: CircuitBreakerRule = {
        name: 'Critical Incident',
        enabled: true,
        condition: 'incident.severity === "critical"',
        window: '1m',
        action: 'revert_to_l3',
        alertSeverity: 'critical',
      };

      const metrics = createTestMetrics({
        incidents: { total: 1, critical: 1, fromAutonomousActions: 1 },
      });

      expect(evaluateRule(rule, metrics)).toBe(true);
    });

    it('should not trigger when no critical incidents', () => {
      const rule: CircuitBreakerRule = {
        name: 'Critical Incident',
        enabled: true,
        condition: 'incident.severity === "critical"',
        window: '1m',
        action: 'revert_to_l3',
        alertSeverity: 'critical',
      };

      const metrics = createTestMetrics({ incidents: { total: 0, critical: 0, fromAutonomousActions: 0 } });

      expect(evaluateRule(rule, metrics)).toBe(false);
    });

    it('should trigger on repeated command failures', () => {
      const rule: CircuitBreakerRule = {
        name: 'Repeated Failures',
        enabled: true,
        condition: 'commandType.failures >= 3',
        window: '5m',
        action: 'pause_command_type',
        alertSeverity: 'high',
      };

      const metrics = createTestMetrics({
        commands: { ...createTestMetrics().commands, failed: 5 },
      });

      expect(evaluateRule(rule, metrics)).toBe(true);
    });

    it('should trigger on many constraint violations', () => {
      const rule: CircuitBreakerRule = {
        name: 'Many Constraint Violations',
        enabled: true,
        condition: 'constraintViolations > 10',
        window: '10m',
        action: 'alert_only',
        alertSeverity: 'medium',
      };

      const metrics = createTestMetrics({
        safety: { constraintViolations: 15, emergencyAborts: 0, safetyGateTriggers: 0 },
      });

      expect(evaluateRule(rule, metrics)).toBe(true);
    });

    it('should handle >= operator', () => {
      const rule: CircuitBreakerRule = {
        name: 'Test',
        enabled: true,
        condition: 'errorRate >= 0.05',
        window: '5m',
        action: 'alert_only',
        alertSeverity: 'low',
      };

      const metricsEqual = createTestMetrics({ rates: { ...createTestMetrics().rates, errorRate: 0.05 } });
      const metricsAbove = createTestMetrics({ rates: { ...createTestMetrics().rates, errorRate: 0.06 } });
      const metricsBelow = createTestMetrics({ rates: { ...createTestMetrics().rates, errorRate: 0.04 } });

      expect(evaluateRule(rule, metricsEqual)).toBe(true);
      expect(evaluateRule(rule, metricsAbove)).toBe(true);
      expect(evaluateRule(rule, metricsBelow)).toBe(false);
    });
  });
});
