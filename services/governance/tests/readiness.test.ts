/**
 * Tests for ReadinessAssessor and checklist evaluation
 */

import { describe, it, expect } from 'vitest';
import { ReadinessAssessor } from '../src/readiness/assessor.js';
import type { AutonomyMetrics, ReadinessAssessorConfig } from '@sim-corp/schemas/kernel/governance';

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
      successRate: 0.9412, // 80 / 85
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

// Helper to create test config
function createTestConfig(overrides?: Partial<ReadinessAssessorConfig>): ReadinessAssessorConfig {
  return {
    // Technical
    metrics: createTestMetrics(),
    currentPhase: 'L3',
    daysSincePhaseStart: 180,
    evalCoverage: 0.92,
    circuitBreakersImplemented: true,
    monitoringOperational: true,
    killSwitchTested: true,
    chaosTestsPassing: true,

    // Process
    incidentResponsePlaybookComplete: true,
    runbooksComplete: true,
    accountabilityFrameworkDocumented: true,
    approvalWorkflowDefined: true,
    escalationPathsEstablished: true,
    rollbackProceduresTested: true,
    complianceRequirementsValidated: true,
    auditTrailComprehensive: true,

    // Organizational
    teamTrainedOnMonitoring: true,
    onCallRotationEstablished: true,
    coverage24x7Available: true,
    leadershipApprovalObtained: true,
    customerCommunicationPlanReady: true,
    designPartnerValidationComplete: true,

    ...overrides,
  };
}

describe('ReadinessAssessor', () => {
  it('should achieve 95%+ readiness with perfect config', async () => {
    const config = createTestConfig({
      metrics: createTestMetrics({
        rates: {
          successRate: 0.998,
          approvalRate: 0.85,
          rollbackRate: 0.01,
          errorRate: 0.002,
        },
      }),
    });

    const assessor = new ReadinessAssessor(config);
    const report = await assessor.assess();

    expect(report.overall.score).toBeGreaterThanOrEqual(0.95);
    expect(report.overall.ready).toBe(true);
    expect(report.overall.blockers).toHaveLength(0);
  });

  it('should calculate technical readiness correctly', async () => {
    const config = createTestConfig({
      metrics: createTestMetrics({
        rates: {
          successRate: 0.998,
          approvalRate: 0.85,
          rollbackRate: 0.01,
          errorRate: 0.002,
        },
      }),
      daysSincePhaseStart: 200,
      evalCoverage: 0.95,
    });

    const assessor = new ReadinessAssessor(config);
    const report = await assessor.assess();

    // All technical criteria met = 35 points
    expect(report.technical.score).toBe(35);
    expect(report.technical.maxScore).toBe(35);
    expect(report.technical.items.every(item => item.status || !item.required)).toBe(true);
  });

  it('should calculate process readiness correctly', async () => {
    const config = createTestConfig();

    const assessor = new ReadinessAssessor(config);
    const report = await assessor.assess();

    // All process criteria met = 25 points
    expect(report.process.score).toBe(25);
    expect(report.process.maxScore).toBe(25);
  });

  it('should calculate organizational readiness correctly', async () => {
    const config = createTestConfig();

    const assessor = new ReadinessAssessor(config);
    const report = await assessor.assess();

    // All organizational criteria met = 20 points
    expect(report.organizational.score).toBe(20);
    expect(report.organizational.maxScore).toBe(20);
  });

  it('should identify blockers when required items fail', async () => {
    const config = createTestConfig({
      metrics: createTestMetrics({
        rates: {
          successRate: 0.90, // Below 99.5% threshold
          approvalRate: 0.85,
          rollbackRate: 0.01,
          errorRate: 0.10,
        },
      }),
      daysSincePhaseStart: 100, // Below 180 days threshold
      evalCoverage: 0.80, // Below 90% threshold
    });

    const assessor = new ReadinessAssessor(config);
    const report = await assessor.assess();

    expect(report.overall.ready).toBe(false);
    expect(report.overall.blockers.length).toBeGreaterThan(0);
    expect(report.overall.blockers).toContain('6+ months running at L3');
    expect(report.overall.blockers).toContain('Command success rate >99.5%');
    expect(report.overall.blockers).toContain('Eval coverage >90%');
  });

  it('should generate recommendations for low success rate', async () => {
    const config = createTestConfig({
      metrics: createTestMetrics({
        rates: {
          successRate: 0.90, // Below threshold
          approvalRate: 0.85,
          rollbackRate: 0.01,
          errorRate: 0.10,
        },
      }),
    });

    const assessor = new ReadinessAssessor(config);
    const report = await assessor.assess();

    const investigateRecs = report.recommendations.filter(r => r.type === 'investigate');
    expect(investigateRecs.length).toBeGreaterThan(0);
    expect(investigateRecs.some(r => r.rationale.includes('success rate'))).toBe(true);
  });

  it('should recommend expansion when ready', async () => {
    const config = createTestConfig({
      metrics: createTestMetrics({
        rates: {
          successRate: 0.998,
          approvalRate: 0.90,
          rollbackRate: 0.01,
          errorRate: 0.002,
        },
      }),
    });

    const assessor = new ReadinessAssessor(config);
    const report = await assessor.assess();

    expect(report.overall.ready).toBe(true);

    const expandRecs = report.recommendations.filter(r => r.type === 'expand_scope');
    expect(expandRecs.length).toBeGreaterThan(0);
    expect(expandRecs[0].priority).toBe('high');
  });

  it('should recommend rollback on critical incidents', async () => {
    const config = createTestConfig({
      metrics: createTestMetrics({
        incidents: {
          total: 2,
          critical: 2,
          fromAutonomousActions: 1,
        },
      }),
    });

    const assessor = new ReadinessAssessor(config);
    const report = await assessor.assess();

    const rollbackRecs = report.recommendations.filter(r => r.type === 'rollback');
    expect(rollbackRecs.length).toBeGreaterThan(0);
    expect(rollbackRecs[0].priority).toBe('high');
  });

  it('should generate action items from recommendations', async () => {
    const config = createTestConfig({
      metrics: createTestMetrics({
        rates: {
          successRate: 0.90,
          approvalRate: 0.85,
          rollbackRate: 0.01,
          errorRate: 0.10,
        },
      }),
    });

    const assessor = new ReadinessAssessor(config);
    const report = await assessor.assess();

    expect(report.nextActions.length).toBeGreaterThan(0);
    expect(report.nextActions.every(action => action.completed === false)).toBe(true);
  });

  it('should handle partial process readiness', async () => {
    const config = createTestConfig({
      incidentResponsePlaybookComplete: false,
      runbooksComplete: false,
    });

    const assessor = new ReadinessAssessor(config);
    const report = await assessor.assess();

    // Should lose 5 + 3 = 8 points from process
    expect(report.process.score).toBe(25 - 8);
    expect(report.overall.ready).toBe(false);
    expect(report.overall.blockers).toContain('Incident response playbook complete');
    expect(report.overall.blockers).toContain('Runbooks for autonomous actions');
  });

  it('should handle partial organizational readiness', async () => {
    const config = createTestConfig({
      teamTrainedOnMonitoring: false,
      leadershipApprovalObtained: false,
    });

    const assessor = new ReadinessAssessor(config);
    const report = await assessor.assess();

    // Should lose 5 + 5 = 10 points from organizational
    expect(report.organizational.score).toBe(20 - 10);
    expect(report.overall.ready).toBe(false);
  });

  it('should calculate overall score as percentage of 80 points', async () => {
    const config = createTestConfig();

    const assessor = new ReadinessAssessor(config);
    const report = await assessor.assess();

    const totalPoints = report.technical.score + report.process.score + report.organizational.score;
    const expectedScore = totalPoints / 80;

    expect(report.overall.score).toBeCloseTo(expectedScore, 5);
  });
});
