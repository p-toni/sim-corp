/**
 * Proposal generator for scope expansion
 */

import type {
  ScopeExpansionProposal,
  AutonomyMetrics,
  ReadinessReport,
  AutonomyPhase,
} from '@sim-corp/schemas/kernel/governance';
import { randomUUID } from 'crypto';

export interface ProposalGeneratorConfig {
  currentPhase: AutonomyPhase;
  metrics: AutonomyMetrics;
  readiness: ReadinessReport;
}

/**
 * Generate scope expansion proposal
 */
export function generateScopeExpansionProposal(config: ProposalGeneratorConfig): ScopeExpansionProposal {
  const { currentPhase, metrics, readiness } = config;

  // Determine target phase
  const targetPhase = getNextPhase(currentPhase);

  // Select commands to whitelist
  const commandsToWhitelist = selectCommandsForWhitelist(currentPhase, targetPhase);

  // Calculate validation period (days)
  const validationPeriod = calculateValidationPeriod(targetPhase);

  // Generate key achievements
  const keyAchievements = generateKeyAchievements(metrics, readiness);

  // Assess risk
  const riskAssessment = assessRisk(metrics, readiness, targetPhase);

  // Determine required approvals
  const requiredApprovals = getRequiredApprovals(targetPhase);

  return {
    proposalId: randomUUID(),
    timestamp: new Date(),
    proposedBy: 'autonomy-governance-agent',
    expansion: {
      currentPhase,
      targetPhase,
      commandsToWhitelist,
      validationPeriod,
    },
    rationale: {
      metrics,
      readiness,
      keyAchievements,
    },
    riskAssessment,
    requiredApprovals,
  };
}

/**
 * Determine next autonomy phase
 */
function getNextPhase(current: AutonomyPhase): AutonomyPhase {
  const phases: AutonomyPhase[] = ['L3', 'L3+', 'L4', 'L4+', 'L5'];
  const currentIndex = phases.indexOf(current);

  if (currentIndex === -1 || currentIndex === phases.length - 1) {
    return current; // Already at max or invalid
  }

  return phases[currentIndex + 1];
}

/**
 * Select commands to add to whitelist based on phase transition
 */
function selectCommandsForWhitelist(current: AutonomyPhase, target: AutonomyPhase): string[] {
  // L3 → L3+: Add low-risk commands
  if (current === 'L3' && target === 'L3+') {
    return ['SET_POWER', 'SET_FAN']; // Temperature/fan control
  }

  // L3+ → L4: Add moderate-risk commands
  if (current === 'L3+' && target === 'L4') {
    return ['SET_DRUM', 'SET_AIRFLOW']; // Drum speed and airflow
  }

  // L4 → L4+: Add higher-risk commands
  if (current === 'L4' && target === 'L4+') {
    return ['PREHEAT', 'COOLING_CYCLE']; // Profile transitions
  }

  // L4+ → L5: Full autonomy (all commands)
  if (current === 'L4+' && target === 'L5') {
    return ['EMERGENCY_SHUTDOWN', 'ABORT']; // Even emergency commands
  }

  return [];
}

/**
 * Calculate validation period in days
 */
function calculateValidationPeriod(targetPhase: AutonomyPhase): number {
  switch (targetPhase) {
    case 'L3+':
      return 14; // 2 weeks for first expansion
    case 'L4':
      return 21; // 3 weeks for L4
    case 'L4+':
      return 30; // 1 month for higher autonomy
    case 'L5':
      return 60; // 2 months for full autonomy
    default:
      return 14;
  }
}

/**
 * Generate key achievements from metrics and readiness
 */
function generateKeyAchievements(metrics: AutonomyMetrics, readiness: ReadinessReport): string[] {
  const achievements: string[] = [];

  // Command performance achievements
  if (metrics.rates.successRate >= 0.995) {
    achievements.push(`Achieved ${(metrics.rates.successRate * 100).toFixed(2)}% command success rate (threshold: 99.5%)`);
  }

  if (metrics.rates.approvalRate >= 0.80) {
    achievements.push(`${(metrics.rates.approvalRate * 100).toFixed(1)}% command approval rate demonstrates strong alignment with user intent`);
  }

  if (metrics.rates.rollbackRate < 0.02) {
    achievements.push(`Low rollback rate (${(metrics.rates.rollbackRate * 100).toFixed(2)}%) indicates reliable command execution`);
  }

  // Safety achievements
  if (metrics.incidents.critical === 0) {
    achievements.push('Zero critical incidents from autonomous actions');
  }

  if (metrics.incidents.fromAutonomousActions === 0) {
    achievements.push('No incidents attributed to autonomous operations');
  }

  // Readiness achievements
  if (readiness.overall.score >= 0.95) {
    achievements.push(`Overall readiness score: ${(readiness.overall.score * 100).toFixed(1)}% (threshold: 95%)`);
  }

  if (readiness.technical.score === readiness.technical.maxScore) {
    achievements.push('Perfect technical readiness score (35/35 points)');
  }

  if (readiness.overall.blockers.length === 0) {
    achievements.push('All required readiness criteria met');
  }

  // Duration achievement
  if (readiness.daysSincePhaseStart >= 180) {
    achievements.push(`${readiness.daysSincePhaseStart} days of stable operation at current autonomy level`);
  }

  // Execution volume
  if (metrics.commands.total >= 1000) {
    achievements.push(`Successfully executed ${metrics.commands.total.toLocaleString()} commands in evaluation period`);
  }

  return achievements;
}

/**
 * Assess risk level for scope expansion
 */
function assessRisk(
  metrics: AutonomyMetrics,
  readiness: ReadinessReport,
  targetPhase: AutonomyPhase
): { level: 'low' | 'medium' | 'high'; mitigations: string[]; rollbackPlan: string } {
  let riskLevel: 'low' | 'medium' | 'high' = 'low';
  const mitigations: string[] = [];

  // Assess risk based on metrics (risk threshold slightly higher than readiness threshold)
  if (metrics.rates.successRate < 0.997) {
    riskLevel = 'medium';
    mitigations.push('Monitor command success rate closely during validation period');
  }

  if (metrics.rates.errorRate > 0.02) {
    riskLevel = 'medium';
    mitigations.push('Enhanced error monitoring and alerting');
  }

  if (readiness.overall.score < 0.97) {
    riskLevel = 'medium';
    mitigations.push('Address remaining readiness gaps during validation period');
  }

  // Higher phases carry more risk
  if (targetPhase === 'L4+' || targetPhase === 'L5') {
    if (riskLevel === 'low') {
      riskLevel = 'medium';
    }
    mitigations.push('Extended validation period with close monitoring');
    mitigations.push('Regular check-ins with stakeholders');
  }

  // Default mitigations
  if (mitigations.length === 0) {
    mitigations.push('Circuit breakers remain active');
    mitigations.push('Weekly readiness assessments');
    mitigations.push('Real-time monitoring and alerting');
  }

  // Rollback plan
  const rollbackPlan = `
If critical incidents occur or readiness score drops below 90% during validation period:
1. Immediately revert to ${readiness.currentPhase} (command whitelist restored to previous state)
2. Conduct incident review within 24 hours
3. Identify root cause and implement fixes
4. Re-assess readiness before attempting expansion again
5. Minimum 30-day stabilization period before retry

Circuit breakers remain active and will automatically revert to L3 if:
- Error rate exceeds 5% in any 5-minute window
- 3+ command failures of same type in 5 minutes
- Critical incident detected
  `.trim();

  return {
    level: riskLevel,
    mitigations,
    rollbackPlan,
  };
}

/**
 * Determine required approvals based on target phase
 */
function getRequiredApprovals(targetPhase: AutonomyPhase): string[] {
  switch (targetPhase) {
    case 'L3+':
      return ['tech-lead']; // First expansion needs technical approval
    case 'L4':
      return ['tech-lead', 'ops-lead']; // Higher autonomy needs ops approval
    case 'L4+':
      return ['tech-lead', 'ops-lead', 'product-lead']; // Significant autonomy needs product input
    case 'L5':
      return ['tech-lead', 'ops-lead', 'product-lead', 'exec-sponsor']; // Full autonomy needs executive approval
    default:
      return ['tech-lead'];
  }
}
