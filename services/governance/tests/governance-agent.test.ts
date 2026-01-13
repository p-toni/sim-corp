/**
 * Tests for AutonomyGovernanceAgent and proposal generation
 */

import { describe, it, expect } from 'vitest';
import { generateScopeExpansionProposal } from '../src/agent/proposal-generator.js';
import type { AutonomyMetrics, ReadinessReport, AutonomyPhase } from '@sim-corp/schemas/kernel/governance';

// Helper to create test metrics
function createTestMetrics(): AutonomyMetrics {
  return {
    period: {
      start: new Date('2024-01-01'),
      end: new Date('2024-01-31'),
    },
    commands: {
      total: 1000,
      proposed: 1000,
      approved: 900,
      rejected: 100,
      succeeded: 895,
      failed: 5,
      rolledBack: 2,
    },
    rates: {
      successRate: 0.9956, // 895/900
      approvalRate: 0.90,
      rollbackRate: 0.0022,
      errorRate: 0.0056,
    },
    incidents: {
      total: 0,
      critical: 0,
      fromAutonomousActions: 0,
    },
    safety: {
      constraintViolations: 2,
      emergencyAborts: 0,
      safetyGateTriggers: 0,
    },
  };
}

// Helper to create test readiness report
function createTestReadiness(phase: AutonomyPhase): ReadinessReport {
  return {
    timestamp: new Date(),
    currentPhase: phase,
    daysSincePhaseStart: 200,
    overall: {
      score: 0.97,
      ready: true,
      blockers: [],
    },
    technical: {
      score: 35,
      maxScore: 35,
      items: [],
    },
    process: {
      score: 24,
      maxScore: 25,
      items: [],
    },
    organizational: {
      score: 19,
      maxScore: 20,
      items: [],
    },
    recommendations: [],
    nextActions: [],
  };
}

describe('Proposal Generation', () => {
  it('should generate L3 → L3+ expansion proposal', () => {
    const metrics = createTestMetrics();
    const readiness = createTestReadiness('L3');

    const proposal = generateScopeExpansionProposal({
      currentPhase: 'L3',
      metrics,
      readiness,
    });

    expect(proposal.proposalId).toBeDefined();
    expect(proposal.proposedBy).toBe('autonomy-governance-agent');
    expect(proposal.expansion.currentPhase).toBe('L3');
    expect(proposal.expansion.targetPhase).toBe('L3+');
    expect(proposal.expansion.commandsToWhitelist).toContain('SET_POWER');
    expect(proposal.expansion.commandsToWhitelist).toContain('SET_FAN');
    expect(proposal.expansion.validationPeriod).toBe(14); // 2 weeks
  });

  it('should generate L3+ → L4 expansion proposal', () => {
    const metrics = createTestMetrics();
    const readiness = createTestReadiness('L3+');

    const proposal = generateScopeExpansionProposal({
      currentPhase: 'L3+',
      metrics,
      readiness,
    });

    expect(proposal.expansion.currentPhase).toBe('L3+');
    expect(proposal.expansion.targetPhase).toBe('L4');
    expect(proposal.expansion.commandsToWhitelist).toContain('SET_DRUM');
    expect(proposal.expansion.commandsToWhitelist).toContain('SET_AIRFLOW');
    expect(proposal.expansion.validationPeriod).toBe(21); // 3 weeks
  });

  it('should generate L4 → L4+ expansion proposal', () => {
    const metrics = createTestMetrics();
    const readiness = createTestReadiness('L4');

    const proposal = generateScopeExpansionProposal({
      currentPhase: 'L4',
      metrics,
      readiness,
    });

    expect(proposal.expansion.currentPhase).toBe('L4');
    expect(proposal.expansion.targetPhase).toBe('L4+');
    expect(proposal.expansion.commandsToWhitelist).toContain('PREHEAT');
    expect(proposal.expansion.commandsToWhitelist).toContain('COOLING_CYCLE');
    expect(proposal.expansion.validationPeriod).toBe(30); // 1 month
  });

  it('should generate L4+ → L5 expansion proposal', () => {
    const metrics = createTestMetrics();
    const readiness = createTestReadiness('L4+');

    const proposal = generateScopeExpansionProposal({
      currentPhase: 'L4+',
      metrics,
      readiness,
    });

    expect(proposal.expansion.currentPhase).toBe('L4+');
    expect(proposal.expansion.targetPhase).toBe('L5');
    expect(proposal.expansion.commandsToWhitelist).toContain('EMERGENCY_SHUTDOWN');
    expect(proposal.expansion.commandsToWhitelist).toContain('ABORT');
    expect(proposal.expansion.validationPeriod).toBe(60); // 2 months
  });

  it('should include key achievements', () => {
    const metrics = createTestMetrics();
    const readiness = createTestReadiness('L3');

    const proposal = generateScopeExpansionProposal({
      currentPhase: 'L3',
      metrics,
      readiness,
    });

    expect(proposal.rationale.keyAchievements.length).toBeGreaterThan(0);
    expect(proposal.rationale.keyAchievements.some(a => a.includes('success rate'))).toBe(true);
    expect(proposal.rationale.keyAchievements.some(a => a.includes('Zero critical incidents'))).toBe(true);
  });

  it('should assess risk as low for perfect metrics', () => {
    const metrics = createTestMetrics();
    // Override with truly excellent metrics
    metrics.rates.successRate = 0.998; // 99.8% - above risk threshold
    metrics.rates.errorRate = 0.002; // 0.2% - very low

    const readiness = createTestReadiness('L3');

    const proposal = generateScopeExpansionProposal({
      currentPhase: 'L3',
      metrics,
      readiness,
    });

    expect(proposal.riskAssessment.level).toBe('low');
    expect(proposal.riskAssessment.mitigations.length).toBeGreaterThan(0);
    expect(proposal.riskAssessment.rollbackPlan).toContain('revert to L3');
  });

  it('should assess risk as medium for marginal metrics', () => {
    const metrics = createTestMetrics();
    metrics.rates.successRate = 0.996; // Just above threshold
    metrics.rates.errorRate = 0.025; // Slightly elevated

    const readiness = createTestReadiness('L3');
    readiness.overall.score = 0.955; // Just above threshold

    const proposal = generateScopeExpansionProposal({
      currentPhase: 'L3',
      metrics,
      readiness,
    });

    expect(proposal.riskAssessment.level).toBe('medium');
    expect(proposal.riskAssessment.mitigations).toContain('Monitor command success rate closely during validation period');
  });

  it('should require more approvals for higher phases', () => {
    const metrics = createTestMetrics();

    const proposalL3Plus = generateScopeExpansionProposal({
      currentPhase: 'L3',
      metrics,
      readiness: createTestReadiness('L3'),
    });

    const proposalL4 = generateScopeExpansionProposal({
      currentPhase: 'L3+',
      metrics,
      readiness: createTestReadiness('L3+'),
    });

    const proposalL5 = generateScopeExpansionProposal({
      currentPhase: 'L4+',
      metrics,
      readiness: createTestReadiness('L4+'),
    });

    expect(proposalL3Plus.requiredApprovals).toEqual(['tech-lead']);
    expect(proposalL4.requiredApprovals).toEqual(['tech-lead', 'ops-lead']);
    expect(proposalL5.requiredApprovals).toContain('exec-sponsor');
  });

  it('should include validation period appropriate for phase', () => {
    const metrics = createTestMetrics();

    const proposals = [
      generateScopeExpansionProposal({ currentPhase: 'L3', metrics, readiness: createTestReadiness('L3') }),
      generateScopeExpansionProposal({ currentPhase: 'L3+', metrics, readiness: createTestReadiness('L3+') }),
      generateScopeExpansionProposal({ currentPhase: 'L4', metrics, readiness: createTestReadiness('L4') }),
      generateScopeExpansionProposal({ currentPhase: 'L4+', metrics, readiness: createTestReadiness('L4+') }),
    ];

    // Validation periods should increase with autonomy level
    expect(proposals[0].expansion.validationPeriod).toBe(14);
    expect(proposals[1].expansion.validationPeriod).toBe(21);
    expect(proposals[2].expansion.validationPeriod).toBe(30);
    expect(proposals[3].expansion.validationPeriod).toBe(60);
  });

  it('should include metrics and readiness in rationale', () => {
    const metrics = createTestMetrics();
    const readiness = createTestReadiness('L3');

    const proposal = generateScopeExpansionProposal({
      currentPhase: 'L3',
      metrics,
      readiness,
    });

    expect(proposal.rationale.metrics).toEqual(metrics);
    expect(proposal.rationale.readiness).toEqual(readiness);
  });
});
