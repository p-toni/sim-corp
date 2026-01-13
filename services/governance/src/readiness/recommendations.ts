/**
 * Recommendation generation based on readiness assessment
 */

import type {
  Recommendation,
  ChecklistStatus,
  AutonomyMetrics,
  AutonomyPhase,
  ReadinessReport,
} from '@sim-corp/schemas/kernel/governance';

export interface RecommendationInputs {
  technical: ChecklistStatus;
  process: ChecklistStatus;
  organizational: ChecklistStatus;
  overall: ReadinessReport['overall'];
  metrics: AutonomyMetrics;
  currentPhase: AutonomyPhase;
}

/**
 * Generate recommendations based on readiness assessment
 */
export function generateRecommendations(inputs: RecommendationInputs): Recommendation[] {
  const recommendations: Recommendation[] = [];

  // Overall readiness
  if (inputs.overall.ready) {
    recommendations.push({
      type: 'expand_scope',
      priority: 'high',
      rationale: `System has achieved ${(inputs.overall.score * 100).toFixed(1)}% readiness (threshold: 95%). All required criteria met.`,
      actions: [
        'Propose scope expansion to next autonomy phase',
        'Identify command types for whitelist expansion',
        'Prepare validation period plan',
        'Brief stakeholders on expansion proposal',
      ],
    });
  } else if (inputs.overall.score >= 0.90) {
    recommendations.push({
      type: 'maintain',
      priority: 'medium',
      rationale: `System at ${(inputs.overall.score * 100).toFixed(1)}% readiness. Close to threshold but blockers remain: ${inputs.overall.blockers.join(', ')}`,
      actions: [
        'Focus on resolving remaining blockers',
        'Continue monitoring current autonomy level',
        'Schedule re-assessment in 2 weeks',
      ],
    });
  } else if (inputs.overall.score < 0.80) {
    recommendations.push({
      type: 'investigate',
      priority: 'high',
      rationale: `System at ${(inputs.overall.score * 100).toFixed(1)}% readiness. Significant gaps in: ${inputs.overall.blockers.slice(0, 3).join(', ')}`,
      actions: [
        'Conduct root cause analysis of low readiness',
        'Create improvement roadmap',
        'Consider rolling back autonomous scope if issues persist',
      ],
    });
  }

  // Technical recommendations
  if (inputs.technical.score < inputs.technical.maxScore * 0.9) {
    const failedRequired = inputs.technical.items.filter(item => item.required && !item.status);
    if (failedRequired.length > 0) {
      recommendations.push({
        type: 'investigate',
        priority: 'high',
        rationale: `Technical readiness at ${((inputs.technical.score / inputs.technical.maxScore) * 100).toFixed(1)}%. Required criteria failing: ${failedRequired.map(i => i.name).join(', ')}`,
        actions: failedRequired.map(item => `Address: ${item.name} - ${item.details}`),
      });
    }
  }

  // Command performance recommendations
  if (inputs.metrics.rates.successRate < 0.995) {
    recommendations.push({
      type: 'investigate',
      priority: 'high',
      rationale: `Command success rate (${(inputs.metrics.rates.successRate * 100).toFixed(2)}%) below 99.5% threshold`,
      actions: [
        'Analyze recent command failures',
        'Improve error handling and retry logic',
        'Review command validation constraints',
      ],
    });
  }

  if (inputs.metrics.rates.errorRate > 0.05) {
    recommendations.push({
      type: 'investigate',
      priority: 'high',
      rationale: `Error rate (${(inputs.metrics.rates.errorRate * 100).toFixed(2)}%) exceeds 5% threshold`,
      actions: [
        'Review error logs for patterns',
        'Enhance command validation',
        'Consider reducing autonomous scope until stable',
      ],
    });
  }

  // Process recommendations
  if (inputs.process.score < inputs.process.maxScore * 0.9) {
    const failedRequired = inputs.process.items.filter(item => item.required && !item.status);
    if (failedRequired.length > 0) {
      recommendations.push({
        type: 'maintain',
        priority: 'high',
        rationale: `Process readiness at ${((inputs.process.score / inputs.process.maxScore) * 100).toFixed(1)}%. Documentation/approval gaps detected.`,
        actions: failedRequired.map(item => `Complete: ${item.name}`),
      });
    }
  }

  // Organizational recommendations
  if (inputs.organizational.score < inputs.organizational.maxScore * 0.9) {
    const failedRequired = inputs.organizational.items.filter(item => item.required && !item.status);
    if (failedRequired.length > 0) {
      recommendations.push({
        type: 'maintain',
        priority: 'high',
        rationale: `Organizational readiness at ${((inputs.organizational.score / inputs.organizational.maxScore) * 100).toFixed(1)}%. Team/stakeholder alignment needed.`,
        actions: failedRequired.map(item => `Establish: ${item.name}`),
      });
    }
  }

  // Safety recommendations
  if (inputs.metrics.incidents.critical > 0) {
    recommendations.push({
      type: 'rollback',
      priority: 'high',
      rationale: `${inputs.metrics.incidents.critical} critical incidents detected. Safety concerns require immediate attention.`,
      actions: [
        'Conduct incident review',
        'Identify systemic issues',
        'Consider reverting to more conservative autonomy level',
        'Implement additional safety gates',
      ],
    });
  }

  if (inputs.metrics.safety.constraintViolations > 10) {
    recommendations.push({
      type: 'investigate',
      priority: 'medium',
      rationale: `${inputs.metrics.safety.constraintViolations} constraint violations detected. May indicate poor command proposals.`,
      actions: [
        'Review constraint definitions',
        'Improve command generation logic',
        'Enhance validation before proposal',
      ],
    });
  }

  // Approval rate recommendations
  if (inputs.metrics.rates.approvalRate < 0.80) {
    recommendations.push({
      type: 'maintain',
      priority: 'medium',
      rationale: `Command approval rate (${(inputs.metrics.rates.approvalRate * 100).toFixed(1)}%) below 80%. Humans frequently rejecting proposals.`,
      actions: [
        'Analyze rejection reasons',
        'Improve command proposal quality',
        'Better align with user intent',
      ],
    });
  }

  return recommendations;
}
