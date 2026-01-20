/**
 * CircuitBreaker - Real-time monitoring and anomaly detection
 *
 * Monitors command execution and triggers circuit breaker rules
 * to prevent runaway autonomy.
 */

import type { Database } from '@sim-corp/database';
import type {
  CircuitBreakerRule,
  CircuitBreakerEvent,
  AutonomyMetrics,
} from '@sim-corp/schemas/kernel/governance';
import { evaluateRule, parseTimeWindow } from './rules.js';
import {
  CircuitBreakerRulesRepo,
  CircuitBreakerEventsRepo,
  GovernanceStateRepo,
} from '../db/repo.js';
import { createMetricsCollector } from '../metrics/collector.js';
import { randomUUID } from 'crypto';

export interface CircuitBreakerConfig {
  enabled: boolean;
  checkInterval: number; // milliseconds
}

export class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private rulesRepo: CircuitBreakerRulesRepo;
  private eventsRepo: CircuitBreakerEventsRepo;
  private stateRepo: GovernanceStateRepo;
  private intervalId?: NodeJS.Timeout;

  constructor(config: CircuitBreakerConfig, db: Database) {
    this.config = config;
    this.rulesRepo = new CircuitBreakerRulesRepo(db);
    this.eventsRepo = new CircuitBreakerEventsRepo(db);
    this.stateRepo = new GovernanceStateRepo(db);
  }

  /**
   * Start circuit breaker monitoring
   */
  start(): void {
    if (!this.config.enabled) {
      console.log('[CircuitBreaker] Disabled by configuration');
      return;
    }

    console.log(`[CircuitBreaker] Starting monitoring (interval: ${this.config.checkInterval}ms)`);

    // Run initial check
    this.check().catch(err => {
      console.error('[CircuitBreaker] Error in initial check:', err);
    });

    // Schedule periodic checks
    this.intervalId = setInterval(() => {
      this.check().catch(err => {
        console.error('[CircuitBreaker] Error in periodic check:', err);
      });
    }, this.config.checkInterval);
  }

  /**
   * Stop circuit breaker monitoring
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      console.log('[CircuitBreaker] Stopped monitoring');
    }
  }

  /**
   * Run circuit breaker check
   */
  private async check(): Promise<void> {
    console.log('[CircuitBreaker] Running check...');

    // Get enabled rules
    const rules = await this.rulesRepo.getEnabled();
    console.log(`[CircuitBreaker] Found ${rules.length} enabled rules`);

    if (rules.length === 0) {
      return;
    }

    // Collect recent metrics for each rule's window
    for (const rule of rules) {
      try {
        console.log(`[CircuitBreaker] Checking rule: "${rule.name}"`);
        await this.checkRule(rule);
      } catch (error) {
        console.error(`[CircuitBreaker] Error checking rule "${rule.name}":`, error);
      }
    }

    console.log('[CircuitBreaker] Check complete');
  }

  /**
   * Check a specific circuit breaker rule
   */
  private async checkRule(rule: CircuitBreakerRule): Promise<void> {
    // Parse time window
    const windowMs = parseTimeWindow(rule.window);
    const now = new Date();
    const start = new Date(now.getTime() - windowMs);

    // Collect metrics for the window
    const metrics = await this.getMetricsForWindow({ start, end: now });

    console.log(`[CircuitBreaker] Rule "${rule.name}" - Error rate: ${(metrics.rates.errorRate * 100).toFixed(2)}%, Condition: ${rule.condition}`);

    // Evaluate rule
    const shouldTrigger = evaluateRule(rule, metrics);

    console.log(`[CircuitBreaker] Rule "${rule.name}" - Should trigger: ${shouldTrigger}`);

    if (shouldTrigger) {
      await this.triggerBreaker(rule, metrics);
    }
  }

  /**
   * Trigger circuit breaker
   */
  private async triggerBreaker(rule: CircuitBreakerRule, metrics: AutonomyMetrics): Promise<void> {
    console.warn(`[CircuitBreaker] Rule triggered: "${rule.name}"`);
    console.warn(`[CircuitBreaker] Action: ${rule.action}`);

    // Create event
    const event: CircuitBreakerEvent = {
      id: randomUUID(),
      timestamp: new Date(),
      rule,
      metrics,
      action: rule.action,
      details: `Circuit breaker triggered: ${rule.condition}. Current metrics: success rate ${(metrics.rates.successRate * 100).toFixed(2)}%, error rate ${(metrics.rates.errorRate * 100).toFixed(2)}%`,
      resolved: false,
    };

    // Save event
    await this.eventsRepo.save(event);

    // Execute action
    await this.executeAction(event);

    // Alert on-call (placeholder)
    await this.alertOnCall(event);
  }

  /**
   * Execute circuit breaker action
   */
  private async executeAction(event: CircuitBreakerEvent): Promise<void> {
    switch (event.action) {
      case 'revert_to_l3':
        await this.revertToL3(event);
        break;

      case 'pause_command_type':
        await this.pauseCommandType(event);
        break;

      case 'alert_only':
        // Already alerted via alertOnCall
        console.log('[CircuitBreaker] Alert-only action, no autonomy changes');
        break;

      default:
        console.warn(`[CircuitBreaker] Unknown action: ${event.action}`);
    }
  }

  /**
   * Revert autonomy level to L3
   */
  private async revertToL3(event: CircuitBreakerEvent): Promise<void> {
    const state = await this.stateRepo.getState();
    if (!state) {
      console.error('[CircuitBreaker] Cannot revert to L3: governance state not found');
      return;
    }

    if (state.currentPhase === 'L3') {
      console.log('[CircuitBreaker] Already at L3, no revert needed');
      return;
    }

    console.warn(`[CircuitBreaker] Reverting from ${state.currentPhase} to L3`);

    // Update governance state
    await this.stateRepo.updateState({
      currentPhase: 'L3',
      phaseStartDate: new Date(),
      commandWhitelist: [], // Clear whitelist - require human approval for all commands
    });

    console.warn('[CircuitBreaker] Reverted to L3. All commands now require human approval.');
  }

  /**
   * Pause specific command type
   */
  private async pauseCommandType(event: CircuitBreakerEvent): Promise<void> {
    // Placeholder: Would integrate with command service to disable specific command types
    // For now, just log
    console.warn('[CircuitBreaker] Pausing problematic command types');
    console.warn('[CircuitBreaker] TODO: Implement command type pausing in command service');
  }

  /**
   * Alert on-call team
   */
  private async alertOnCall(event: CircuitBreakerEvent): Promise<void> {
    // Placeholder: Would integrate with PagerDuty, Slack, etc.
    console.error('='.repeat(80));
    console.error('[CIRCUIT BREAKER ALERT]');
    console.error(`Severity: ${event.rule.alertSeverity.toUpperCase()}`);
    console.error(`Rule: ${event.rule.name}`);
    console.error(`Action: ${event.action}`);
    console.error(`Details: ${event.details}`);
    console.error('='.repeat(80));

    // In production, would send alerts via:
    // - PagerDuty for critical/high severity
    // - Slack for medium/low severity
    // - Email for audit trail
  }

  /**
   * Get metrics for a time window
   */
  private async getMetricsForWindow(timeRange: { start: Date; end: Date }): Promise<AutonomyMetrics> {
    const collector = await createMetricsCollector();
    try {
      const metrics = await collector.collectAll(timeRange);
      return metrics;
    } finally {
      await collector.close();
    }
  }
}

/**
 * Create circuit breaker from environment
 */
export function createCircuitBreaker(db: Database): CircuitBreaker {
  const config: CircuitBreakerConfig = {
    enabled: process.env.CIRCUIT_BREAKER_ENABLED !== 'false',
    checkInterval: parseInt(process.env.CIRCUIT_BREAKER_INTERVAL || '60000', 10), // Default: 1 minute
  };

  return new CircuitBreaker(config, db);
}
