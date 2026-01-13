/**
 * AutonomyGovernanceAgent - Orchestrates weekly governance cycle
 *
 * Responsibilities:
 * - Collect autonomy metrics
 * - Assess readiness for expansion
 * - Generate governance reports
 * - Propose scope expansions when ready
 * - Monitor circuit breaker events
 */

import type {
  GovernanceReport,
  AutonomyMetrics,
  ReadinessReport,
  ScopeExpansionProposal,
  Recommendation,
  Action,
} from '@sim-corp/schemas/kernel/governance';
import { createMetricsCollector } from '../metrics/collector.js';
import { createReadinessAssessor } from '../readiness/assessor.js';
import { generateScopeExpansionProposal } from './proposal-generator.js';
import {
  GovernanceStateRepo,
  GovernanceReportsRepo,
  CircuitBreakerEventsRepo,
  ScopeExpansionProposalsRepo,
} from '../db/repo.js';
import { randomUUID } from 'crypto';

export class AutonomyGovernanceAgent {
  private metricsCollector: ReturnType<typeof createMetricsCollector>;
  private stateRepo: GovernanceStateRepo;
  private reportsRepo: GovernanceReportsRepo;
  private eventsRepo: CircuitBreakerEventsRepo;
  private proposalsRepo: ScopeExpansionProposalsRepo;

  constructor() {
    this.metricsCollector = createMetricsCollector();
    this.stateRepo = new GovernanceStateRepo();
    this.reportsRepo = new GovernanceReportsRepo();
    this.eventsRepo = new CircuitBreakerEventsRepo();
    this.proposalsRepo = new ScopeExpansionProposalsRepo();
  }

  /**
   * Run weekly governance cycle
   */
  async runWeeklyCycle(): Promise<GovernanceReport> {
    console.log('[GovernanceAgent] Starting weekly governance cycle');

    // 1. Collect metrics
    const metrics = await this.collectMetrics();
    console.log(`[GovernanceAgent] Metrics collected: ${metrics.commands.total} commands, ${(metrics.rates.successRate * 100).toFixed(2)}% success rate`);

    // 2. Assess readiness
    const readiness = await this.assessReadiness(metrics);
    console.log(`[GovernanceAgent] Readiness assessed: ${(readiness.overall.score * 100).toFixed(1)}%, ready=${readiness.overall.ready}`);

    // 3. Get circuit breaker events
    const circuitBreakerEvents = this.eventsRepo.getRecent(10);
    console.log(`[GovernanceAgent] Circuit breaker events: ${circuitBreakerEvents.length} recent events`);

    // 4. Decide on scope expansion
    const expansion = await this.decideOnExpansion(metrics, readiness);
    if (expansion) {
      console.log(`[GovernanceAgent] Proposing expansion: ${expansion.expansion.currentPhase} → ${expansion.expansion.targetPhase}`);
    } else {
      console.log('[GovernanceAgent] Not ready for expansion');
    }

    // 5. Generate report
    const report = await this.generateReport(metrics, readiness, expansion, circuitBreakerEvents);
    console.log(`[GovernanceAgent] Report generated: ${report.id}`);

    // 6. Save report
    this.reportsRepo.save(report);

    // 7. Update state
    this.stateRepo.updateState({
      lastReportDate: new Date(),
    });

    console.log('[GovernanceAgent] Weekly governance cycle complete');

    return report;
  }

  /**
   * Collect autonomy metrics for the past week
   */
  private async collectMetrics(): Promise<AutonomyMetrics> {
    const end = new Date();
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

    return await this.metricsCollector.collectAll({ start, end });
  }

  /**
   * Assess readiness for autonomy expansion
   */
  private async assessReadiness(metrics: AutonomyMetrics): Promise<ReadinessReport> {
    const state = this.stateRepo.getState();
    if (!state) {
      throw new Error('Governance state not initialized');
    }

    // Calculate days since phase start
    const daysSincePhaseStart = Math.floor(
      (Date.now() - state.phaseStartDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Create assessor and run assessment
    const assessor = await createReadinessAssessor(
      metrics,
      state.currentPhase,
      daysSincePhaseStart
    );

    return await assessor.assess();
  }

  /**
   * Decide whether to propose scope expansion
   */
  private async decideOnExpansion(
    metrics: AutonomyMetrics,
    readiness: ReadinessReport
  ): Promise<ScopeExpansionProposal | undefined> {
    // Don't propose if not ready
    if (!readiness.overall.ready) {
      return undefined;
    }

    // Don't propose if there are recent unresolved circuit breaker events
    const unresolvedEvents = this.eventsRepo.getUnresolved();
    if (unresolvedEvents.length > 0) {
      console.log(`[GovernanceAgent] ${unresolvedEvents.length} unresolved circuit breaker events, not proposing expansion`);
      return undefined;
    }

    // Don't propose if there's already a pending proposal
    const pendingProposals = this.proposalsRepo.getPending();
    if (pendingProposals.length > 0) {
      console.log('[GovernanceAgent] Pending proposal already exists, not proposing new expansion');
      return undefined;
    }

    // Generate proposal
    const proposal = generateScopeExpansionProposal({
      currentPhase: readiness.currentPhase,
      metrics,
      readiness,
    });

    // Save proposal
    this.proposalsRepo.save(proposal);

    // Update state
    this.stateRepo.updateState({
      lastExpansionDate: new Date(),
    });

    return proposal;
  }

  /**
   * Generate governance report
   */
  private async generateReport(
    metrics: AutonomyMetrics,
    readiness: ReadinessReport,
    expansion: ScopeExpansionProposal | undefined,
    circuitBreakerEvents: any[]
  ): Promise<GovernanceReport> {
    const now = new Date();
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Generate summary
    const summary = this.generateSummary(metrics, readiness, expansion, circuitBreakerEvents);

    // Get recommendations from readiness report
    const recommendations = readiness.recommendations;

    // Get next actions from readiness report
    const nextActions = readiness.nextActions;

    return {
      id: randomUUID(),
      weekStart,
      weekEnd: now,
      generatedAt: now,
      metrics,
      readiness,
      expansion,
      circuitBreakerEvents,
      summary,
      recommendations,
      nextActions,
    };
  }

  /**
   * Generate summary text for report
   */
  private generateSummary(
    metrics: AutonomyMetrics,
    readiness: ReadinessReport,
    expansion: ScopeExpansionProposal | undefined,
    circuitBreakerEvents: any[]
  ): string {
    const lines: string[] = [];

    lines.push('# Weekly Governance Report');
    lines.push('');

    // Executive summary
    lines.push('## Executive Summary');
    lines.push('');
    lines.push(`Current autonomy phase: **${readiness.currentPhase}**`);
    lines.push(`Days in current phase: ${readiness.daysSincePhaseStart}`);
    lines.push(`Overall readiness: **${(readiness.overall.score * 100).toFixed(1)}%** (threshold: 95%)`);
    lines.push(`Ready for expansion: **${readiness.overall.ready ? 'YES' : 'NO'}**`);
    lines.push('');

    // Metrics summary
    lines.push('## Metrics Summary');
    lines.push('');
    lines.push(`- Commands executed: ${metrics.commands.total}`);
    lines.push(`- Success rate: ${(metrics.rates.successRate * 100).toFixed(2)}%`);
    lines.push(`- Approval rate: ${(metrics.rates.approvalRate * 100).toFixed(1)}%`);
    lines.push(`- Error rate: ${(metrics.rates.errorRate * 100).toFixed(2)}%`);
    lines.push(`- Rollback rate: ${(metrics.rates.rollbackRate * 100).toFixed(2)}%`);
    lines.push('');

    // Safety summary
    lines.push('## Safety Summary');
    lines.push('');
    lines.push(`- Critical incidents: ${metrics.incidents.critical}`);
    lines.push(`- Constraint violations: ${metrics.safety.constraintViolations}`);
    lines.push(`- Emergency aborts: ${metrics.safety.emergencyAborts}`);
    lines.push(`- Circuit breaker events: ${circuitBreakerEvents.length}`);
    lines.push('');

    // Readiness breakdown
    lines.push('## Readiness Breakdown');
    lines.push('');
    lines.push(`- Technical: ${readiness.technical.score}/${readiness.technical.maxScore} (${((readiness.technical.score / readiness.technical.maxScore) * 100).toFixed(1)}%)`);
    lines.push(`- Process: ${readiness.process.score}/${readiness.process.maxScore} (${((readiness.process.score / readiness.process.maxScore) * 100).toFixed(1)}%)`);
    lines.push(`- Organizational: ${readiness.organizational.score}/${readiness.organizational.maxScore} (${((readiness.organizational.score / readiness.organizational.maxScore) * 100).toFixed(1)}%)`);
    lines.push('');

    if (readiness.overall.blockers.length > 0) {
      lines.push('## Blockers');
      lines.push('');
      for (const blocker of readiness.overall.blockers) {
        lines.push(`- ${blocker}`);
      }
      lines.push('');
    }

    // Expansion decision
    if (expansion) {
      lines.push('## Scope Expansion Proposal');
      lines.push('');
      lines.push(`**Proposed expansion: ${expansion.expansion.currentPhase} → ${expansion.expansion.targetPhase}**`);
      lines.push('');
      lines.push('Commands to whitelist:');
      for (const cmd of expansion.expansion.commandsToWhitelist) {
        lines.push(`- ${cmd}`);
      }
      lines.push('');
      lines.push(`Validation period: ${expansion.expansion.validationPeriod} days`);
      lines.push(`Risk level: ${expansion.riskAssessment.level}`);
      lines.push('');
      lines.push('Required approvals:');
      for (const approver of expansion.requiredApprovals) {
        lines.push(`- [ ] ${approver}`);
      }
      lines.push('');
    } else {
      lines.push('## No Expansion Proposed');
      lines.push('');
      if (!readiness.overall.ready) {
        lines.push('System not ready for expansion. Address blockers above.');
      } else {
        lines.push('System ready but other conditions prevent expansion (pending proposals, unresolved circuit breaker events).');
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Close database connections
   */
  close(): void {
    this.metricsCollector.close();
  }
}
