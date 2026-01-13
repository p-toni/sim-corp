/**
 * Circuit breaker rule evaluation
 */

import type { CircuitBreakerRule, AutonomyMetrics } from '@sim-corp/schemas/kernel/governance';

/**
 * Evaluate if a circuit breaker rule should trigger
 */
export function evaluateRule(rule: CircuitBreakerRule, metrics: AutonomyMetrics): boolean {
  if (!rule.enabled) {
    return false;
  }

  try {
    // Parse and evaluate the condition
    return evaluateCondition(rule.condition, metrics);
  } catch (error) {
    console.error(`[CircuitBreaker] Error evaluating rule "${rule.name}":`, error);
    return false;
  }
}

/**
 * Evaluate a condition string against metrics
 */
function evaluateCondition(condition: string, metrics: AutonomyMetrics): boolean {
  // Simple condition parser for common patterns
  // Format: "property operator value"
  // Examples: "errorRate > 0.05", "commandType.failures >= 3", "incident.severity === 'critical'"

  // Error rate conditions (check >= before > to avoid substring match)
  if (condition.includes('errorRate >=')) {
    const threshold = parseFloat(condition.split('>=')[1].trim());
    return metrics.rates.errorRate >= threshold;
  }

  if (condition.includes('errorRate >')) {
    const threshold = parseFloat(condition.split('>')[1].trim());
    return metrics.rates.errorRate > threshold;
  }

  // Rollback rate conditions (check >= before >)
  if (condition.includes('rollbackRate >=')) {
    const threshold = parseFloat(condition.split('>=')[1].trim());
    return metrics.rates.rollbackRate >= threshold;
  }

  if (condition.includes('rollbackRate >')) {
    const threshold = parseFloat(condition.split('>')[1].trim());
    return metrics.rates.rollbackRate > threshold;
  }

  // Success rate conditions (check <= before <)
  if (condition.includes('successRate <=')) {
    const threshold = parseFloat(condition.split('<=')[1].trim());
    return metrics.rates.successRate <= threshold;
  }

  if (condition.includes('successRate <')) {
    const threshold = parseFloat(condition.split('<')[1].trim());
    return metrics.rates.successRate < threshold;
  }

  // Incident conditions
  if (condition.includes('incident.severity === "critical"')) {
    return metrics.incidents.critical > 0;
  }

  if (condition.includes('incidents.critical >')) {
    const threshold = parseInt(condition.split('>')[1].trim(), 10);
    return metrics.incidents.critical > threshold;
  }

  // Command failure conditions (would need per-command type tracking)
  if (condition.includes('commandType.failures >=')) {
    // Placeholder: In production, this would track failures per command type
    // For now, use overall failed commands
    const threshold = parseInt(condition.split('>=')[1].trim(), 10);
    return metrics.commands.failed >= threshold;
  }

  // Safety conditions
  if (condition.includes('constraintViolations >')) {
    const threshold = parseInt(condition.split('>')[1].trim(), 10);
    return metrics.safety.constraintViolations > threshold;
  }

  if (condition.includes('emergencyAborts >')) {
    const threshold = parseInt(condition.split('>')[1].trim(), 10);
    return metrics.safety.emergencyAborts > threshold;
  }

  // Default: condition not matched, don't trigger
  return false;
}

/**
 * Parse time window string to milliseconds
 * Examples: "5m" -> 300000, "1h" -> 3600000, "30s" -> 30000
 */
export function parseTimeWindow(window: string): number {
  const match = window.match(/^(\d+)(s|m|h|d)$/);
  if (!match) {
    throw new Error(`Invalid time window format: ${window}`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      throw new Error(`Unknown time unit: ${unit}`);
  }
}
