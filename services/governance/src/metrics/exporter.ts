/**
 * Prometheus metrics exporter for governance service
 */

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

  constructor() {
    this.stateRepo = new GovernanceStateRepo();
    this.metricsRepo = new MetricsSnapshotsRepo();
    this.readinessRepo = new ReadinessAssessmentsRepo();
    this.eventsRepo = new CircuitBreakerEventsRepo();

    // Initialize metrics
    this.currentPhaseGauge = new Gauge({
      name: 'simcorp_governance_current_phase_info',
      help: 'Current autonomy phase (L3=0, L3+=1, L4=2, L4+=3, L5=4)',
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
  updateMetrics(): void {
    this.updatePhaseMetrics();
    this.updateCommandMetrics();
    this.updateReadinessMetrics();
    this.updateCircuitBreakerMetrics();
  }

  /**
   * Update phase metrics
   */
  private updatePhaseMetrics(): void {
    const state = this.stateRepo.getState();
    if (!state) return;

    // Map phase to numeric value
    const phaseMap: Record<string, number> = {
      'L3': 0,
      'L3+': 1,
      'L4': 2,
      'L4+': 3,
      'L5': 4,
    };

    this.currentPhaseGauge.labels(state.currentPhase).set(phaseMap[state.currentPhase] ?? 0);

    const daysSincePhaseStart = Math.floor(
      (Date.now() - state.phaseStartDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    this.daysSincePhaseStartGauge.set(daysSincePhaseStart);
  }

  /**
   * Update command execution metrics
   */
  private updateCommandMetrics(): void {
    const metrics = this.metricsRepo.getLatest();
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
  private updateReadinessMetrics(): void {
    const readiness = this.readinessRepo.getLatest();
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
  private updateCircuitBreakerMetrics(): void {
    const unresolvedEvents = this.eventsRepo.getUnresolved();
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
    this.updateMetrics();

    // Periodic updates
    return setInterval(() => {
      this.updateMetrics();
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
export function createMetricsExporter(): GovernanceMetricsExporter {
  return new GovernanceMetricsExporter();
}
