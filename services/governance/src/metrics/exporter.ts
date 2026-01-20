/**
 * Prometheus metrics exporter for governance service
 */

import type { Database } from '@sim-corp/database';
import { register, Gauge, Counter } from 'prom-client';
import type { AutonomyMetrics, ReadinessReport, CircuitBreakerEvent } from '@sim-corp/schemas/kernel/governance';
import { GovernanceStateRepo, MetricsSnapshotsRepo, ReadinessAssessmentsRepo, CircuitBreakerEventsRepo } from '../db/repo.js';

/**
 * Governance-specific Prometheus metrics
 */
export class GovernanceMetricsExporter {
  private stateRepo: GovernanceStateRepo;
  private metricsRepo: MetricsSnapshotsRepo;
  private readinessRepo: ReadinessAssessmentsRepo;
  private eventsRepo: CircuitBreakerEventsRepo;

  // Phase info
  private currentPhaseGauge: Gauge;
  private daysSincePhaseStartGauge: Gauge;

  // Command metrics
  private commandSuccessRateGauge: Gauge;
  private commandApprovalRateGauge: Gauge;
  private commandErrorRateGauge: Gauge;
  private commandRollbackRateGauge: Gauge;
  private commandsCounter: Counter;

  // Readiness metrics
  private readinessScoreGauge: Gauge;
  private readinessTechnicalScoreGauge: Gauge;
  private readinessProcessScoreGauge: Gauge;
  private readinessOrganizationalScoreGauge: Gauge;
  private readinessTechnicalMaxGauge: Gauge;
  private readinessProcessMaxGauge: Gauge;
  private readinessOrganizationalMaxGauge: Gauge;

  // Circuit breaker metrics
  private circuitBreakerEventsCounter: Counter;
  private circuitBreakerUnresolvedGauge: Gauge;

  // Safety metrics
  private incidentsCounter: Counter;
  private constraintViolationsCounter: Counter;
  private emergencyAbortsCounter: Counter;

  constructor(db: Database) {
    this.stateRepo = new GovernanceStateRepo(db);
    this.metricsRepo = new MetricsSnapshotsRepo(db);
    this.readinessRepo = new ReadinessAssessmentsRepo(db);
    this.eventsRepo = new CircuitBreakerEventsRepo(db);

    // Initialize metrics
    this.currentPhaseGauge = new Gauge({
      name: 'simcorp_governance_current_phase_info',
      help: 'Current autonomy phase (1=active, 0=inactive)',
      labelNames: ['phase'],
    });

    this.daysSincePhaseStartGauge = new Gauge({
      name: 'simcorp_governance_days_since_phase_start',
      help: 'Days since current phase started',
    });

    this.commandSuccessRateGauge = new Gauge({
      name: 'simcorp_governance_command_success_rate',
      help: 'Command success rate (0-1)',
    });

    this.commandApprovalRateGauge = new Gauge({
      name: 'simcorp_governance_command_approval_rate',
      help: 'Command approval rate (0-1)',
    });

    this.commandErrorRateGauge = new Gauge({
      name: 'simcorp_governance_command_error_rate',
      help: 'Command error rate (0-1)',
    });

    this.commandRollbackRateGauge = new Gauge({
      name: 'simcorp_governance_command_rollback_rate',
      help: 'Command rollback rate (0-1)',
    });

    this.commandsCounter = new Counter({
      name: 'simcorp_governance_commands_total',
      help: 'Total number of commands by status',
      labelNames: ['status'],
    });

    this.readinessScoreGauge = new Gauge({
      name: 'simcorp_governance_readiness_score',
      help: 'Overall readiness score (0-1)',
    });

    this.readinessTechnicalScoreGauge = new Gauge({
      name: 'simcorp_governance_readiness_technical_score',
      help: 'Technical readiness score (points earned)',
    });

    this.readinessProcessScoreGauge = new Gauge({
      name: 'simcorp_governance_readiness_process_score',
      help: 'Process readiness score (points earned)',
    });

    this.readinessOrganizationalScoreGauge = new Gauge({
      name: 'simcorp_governance_readiness_organizational_score',
      help: 'Organizational readiness score (points earned)',
    });

    this.readinessTechnicalMaxGauge = new Gauge({
      name: 'simcorp_governance_readiness_technical_max',
      help: 'Technical readiness max score (35 points)',
    });

    this.readinessProcessMaxGauge = new Gauge({
      name: 'simcorp_governance_readiness_process_max',
      help: 'Process readiness max score (25 points)',
    });

    this.readinessOrganizationalMaxGauge = new Gauge({
      name: 'simcorp_governance_readiness_organizational_max',
      help: 'Organizational readiness max score (20 points)',
    });

    this.circuitBreakerEventsCounter = new Counter({
      name: 'simcorp_governance_circuit_breaker_events_total',
      help: 'Total circuit breaker events triggered',
      labelNames: ['rule_name', 'action', 'alert_severity'],
    });

    this.circuitBreakerUnresolvedGauge = new Gauge({
      name: 'simcorp_governance_circuit_breaker_events_unresolved',
      help: 'Number of unresolved circuit breaker events',
    });

    this.incidentsCounter = new Counter({
      name: 'simcorp_governance_incidents_total',
      help: 'Total incidents',
      labelNames: ['severity'],
    });

    this.constraintViolationsCounter = new Counter({
      name: 'simcorp_governance_safety_constraint_violations_total',
      help: 'Total safety constraint violations',
    });

    this.emergencyAbortsCounter = new Counter({
      name: 'simcorp_governance_safety_emergency_aborts_total',
      help: 'Total emergency aborts',
    });
  }

  /**
   * Update all metrics from current state
   */
  async updateMetrics(): Promise<void> {
    await this.updatePhaseMetrics();
    await this.updateCommandMetrics();
    await this.updateReadinessMetrics();
    await this.updateCircuitBreakerMetrics();
  }

  /**
   * Update phase metrics
   */
  private async updatePhaseMetrics(): Promise<void> {
    const state = await this.stateRepo.getState();
    if (!state) return;

    // All possible phases
    const allPhases = ['L3', 'L3+', 'L4', 'L4+', 'L5'];

    // Reset all phase labels to 0 (inactive)
    for (const phase of allPhases) {
      this.currentPhaseGauge.labels(phase).set(0);
    }

    // Set current phase to 1 (active)
    this.currentPhaseGauge.labels(state.currentPhase).set(1);

    const daysSincePhaseStart = Math.floor(
      (Date.now() - state.phaseStartDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    this.daysSincePhaseStartGauge.set(daysSincePhaseStart);
  }

  /**
   * Update command execution metrics
   */
  private async updateCommandMetrics(): Promise<void> {
    const metrics = await this.metricsRepo.getLatest();
    if (!metrics) return;

    // Update rate gauges
    this.commandSuccessRateGauge.set(metrics.rates.successRate);
    this.commandApprovalRateGauge.set(metrics.rates.approvalRate);
    this.commandErrorRateGauge.set(metrics.rates.errorRate);
    this.commandRollbackRateGauge.set(metrics.rates.rollbackRate);

    // Update command counters (set to current values)
    this.commandsCounter.labels('succeeded').inc(metrics.commands.succeeded);
    this.commandsCounter.labels('failed').inc(metrics.commands.failed);
    this.commandsCounter.labels('rejected').inc(metrics.commands.rejected);
    this.commandsCounter.labels('rolledBack').inc(metrics.commands.rolledBack);

    // Update incident counters
    if (metrics.incidents.critical > 0) {
      this.incidentsCounter.labels('critical').inc(metrics.incidents.critical);
    }

    // Update safety counters
    if (metrics.safety.constraintViolations > 0) {
      this.constraintViolationsCounter.inc(metrics.safety.constraintViolations);
    }
    if (metrics.safety.emergencyAborts > 0) {
      this.emergencyAbortsCounter.inc(metrics.safety.emergencyAborts);
    }
  }

  /**
   * Update readiness metrics
   */
  private async updateReadinessMetrics(): Promise<void> {
    const readiness = await this.readinessRepo.getLatest();
    if (!readiness) return;

    // Update overall score
    this.readinessScoreGauge.set(readiness.overall.score);

    // Update category scores
    this.readinessTechnicalScoreGauge.set(readiness.technical.score);
    this.readinessProcessScoreGauge.set(readiness.process.score);
    this.readinessOrganizationalScoreGauge.set(readiness.organizational.score);

    // Update max scores
    this.readinessTechnicalMaxGauge.set(readiness.technical.maxScore);
    this.readinessProcessMaxGauge.set(readiness.process.maxScore);
    this.readinessOrganizationalMaxGauge.set(readiness.organizational.maxScore);
  }

  /**
   * Update circuit breaker metrics
   */
  private async updateCircuitBreakerMetrics(): Promise<void> {
    const unresolvedEvents = await this.eventsRepo.getUnresolved();
    this.circuitBreakerUnresolvedGauge.set(unresolvedEvents.length);
  }

  /**
   * Record a circuit breaker event
   */
  recordCircuitBreakerEvent(event: CircuitBreakerEvent): void {
    this.circuitBreakerEventsCounter
      .labels(event.rule.name, event.action, event.rule.alertSeverity)
      .inc();
  }

  /**
   * Start periodic metrics updates
   */
  startPeriodicUpdates(intervalMs: number = 30000): NodeJS.Timeout {
    // Initial update
    this.updateMetrics().catch(err => {
      console.error('[MetricsExporter] Error in initial update:', err);
    });

    // Periodic updates
    return setInterval(() => {
      this.updateMetrics().catch(err => {
        console.error('[MetricsExporter] Error in periodic update:', err);
      });
    }, intervalMs);
  }

  /**
   * Get Prometheus registry for /metrics endpoint
   */
  getRegistry() {
    return register;
  }
}

/**
 * Create and initialize metrics exporter
 */
export function createMetricsExporter(db: Database): GovernanceMetricsExporter {
  return new GovernanceMetricsExporter(db);
}
