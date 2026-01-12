/**
 * Repository for governance data access
 */

import { db } from './connection.js';
import type {
  GovernanceState,
  GovernanceReport,
  CircuitBreakerEvent,
  CircuitBreakerRule,
  AutonomyMetrics,
  ReadinessReport,
  ScopeExpansionProposal,
} from '@sim-corp/schemas/kernel/governance';

/**
 * Governance state repository (singleton)
 */
export class GovernanceStateRepo {
  getState(): GovernanceState | null {
    const row = db.prepare('SELECT * FROM governance_state WHERE id = 1').get() as any;
    if (!row) return null;

    return {
      currentPhase: row.current_phase,
      phaseStartDate: new Date(row.phase_start_date),
      commandWhitelist: JSON.parse(row.command_whitelist),
      lastReportDate: row.last_report_date ? new Date(row.last_report_date) : undefined,
      lastExpansionDate: row.last_expansion_date ? new Date(row.last_expansion_date) : undefined,
    };
  }

  updateState(state: Partial<GovernanceState>): void {
    const updates: string[] = [];
    const params: any = {};

    if (state.currentPhase !== undefined) {
      updates.push('current_phase = @currentPhase');
      params.currentPhase = state.currentPhase;
    }

    if (state.phaseStartDate !== undefined) {
      updates.push('phase_start_date = @phaseStartDate');
      params.phaseStartDate = state.phaseStartDate.toISOString();
    }

    if (state.commandWhitelist !== undefined) {
      updates.push('command_whitelist = @commandWhitelist');
      params.commandWhitelist = JSON.stringify(state.commandWhitelist);
    }

    if (state.lastReportDate !== undefined) {
      updates.push('last_report_date = @lastReportDate');
      params.lastReportDate = state.lastReportDate.toISOString();
    }

    if (state.lastExpansionDate !== undefined) {
      updates.push('last_expansion_date = @lastExpansionDate');
      params.lastExpansionDate = state.lastExpansionDate.toISOString();
    }

    updates.push("updated_at = datetime('now')");

    const sql = `UPDATE governance_state SET ${updates.join(', ')} WHERE id = 1`;
    db.prepare(sql).run(params);
  }
}

/**
 * Governance reports repository
 */
export class GovernanceReportsRepo {
  save(report: GovernanceReport): void {
    db.prepare(`
      INSERT INTO governance_reports (
        id, week_start, week_end, generated_at,
        metrics, readiness, expansion, circuit_breaker_events,
        summary, recommendations, next_actions
      ) VALUES (
        @id, @weekStart, @weekEnd, @generatedAt,
        @metrics, @readiness, @expansion, @circuitBreakerEvents,
        @summary, @recommendations, @nextActions
      )
    `).run({
      id: report.id,
      weekStart: report.weekStart.toISOString(),
      weekEnd: report.weekEnd.toISOString(),
      generatedAt: report.generatedAt.toISOString(),
      metrics: JSON.stringify(report.metrics),
      readiness: JSON.stringify(report.readiness),
      expansion: report.expansion ? JSON.stringify(report.expansion) : null,
      circuitBreakerEvents: JSON.stringify(report.circuitBreakerEvents),
      summary: report.summary,
      recommendations: JSON.stringify(report.recommendations),
      nextActions: JSON.stringify(report.nextActions),
    });
  }

  getById(id: string): GovernanceReport | null {
    const row = db.prepare('SELECT * FROM governance_reports WHERE id = ?').get(id) as any;
    if (!row) return null;

    return this.rowToReport(row);
  }

  getLatest(): GovernanceReport | null {
    const row = db.prepare('SELECT * FROM governance_reports ORDER BY week_end DESC LIMIT 1').get() as any;
    if (!row) return null;

    return this.rowToReport(row);
  }

  getAll(limit = 10): GovernanceReport[] {
    const rows = db.prepare('SELECT * FROM governance_reports ORDER BY week_end DESC LIMIT ?').all(limit) as any[];
    return rows.map(row => this.rowToReport(row));
  }

  private rowToReport(row: any): GovernanceReport {
    return {
      id: row.id,
      weekStart: new Date(row.week_start),
      weekEnd: new Date(row.week_end),
      generatedAt: new Date(row.generated_at),
      metrics: JSON.parse(row.metrics),
      readiness: JSON.parse(row.readiness),
      expansion: row.expansion ? JSON.parse(row.expansion) : undefined,
      circuitBreakerEvents: JSON.parse(row.circuit_breaker_events),
      summary: row.summary,
      recommendations: JSON.parse(row.recommendations),
      nextActions: JSON.parse(row.next_actions),
    };
  }
}

/**
 * Circuit breaker events repository
 */
export class CircuitBreakerEventsRepo {
  save(event: CircuitBreakerEvent): void {
    db.prepare(`
      INSERT INTO circuit_breaker_events (
        id, timestamp, rule, metrics, action, details, resolved, resolved_at
      ) VALUES (
        @id, @timestamp, @rule, @metrics, @action, @details, @resolved, @resolvedAt
      )
    `).run({
      id: event.id,
      timestamp: event.timestamp.toISOString(),
      rule: JSON.stringify(event.rule),
      metrics: JSON.stringify(event.metrics),
      action: event.action,
      details: event.details,
      resolved: event.resolved ? 1 : 0,
      resolvedAt: event.resolvedAt ? event.resolvedAt.toISOString() : null,
    });
  }

  resolve(id: string): void {
    db.prepare(`
      UPDATE circuit_breaker_events
      SET resolved = 1, resolved_at = datetime('now')
      WHERE id = ?
    `).run(id);
  }

  getUnresolved(): CircuitBreakerEvent[] {
    const rows = db.prepare(`
      SELECT * FROM circuit_breaker_events
      WHERE resolved = 0
      ORDER BY timestamp DESC
    `).all() as any[];

    return rows.map(row => this.rowToEvent(row));
  }

  getRecent(limit = 10): CircuitBreakerEvent[] {
    const rows = db.prepare(`
      SELECT * FROM circuit_breaker_events
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(limit) as any[];

    return rows.map(row => this.rowToEvent(row));
  }

  private rowToEvent(row: any): CircuitBreakerEvent {
    return {
      id: row.id,
      timestamp: new Date(row.timestamp),
      rule: JSON.parse(row.rule),
      metrics: JSON.parse(row.metrics),
      action: row.action,
      details: row.details,
      resolved: row.resolved === 1,
      resolvedAt: row.resolved_at ? new Date(row.resolved_at) : undefined,
    };
  }
}

/**
 * Circuit breaker rules repository
 */
export class CircuitBreakerRulesRepo {
  getAll(): CircuitBreakerRule[] {
    const rows = db.prepare('SELECT * FROM circuit_breaker_rules').all() as any[];
    return rows.map(row => this.rowToRule(row));
  }

  getEnabled(): CircuitBreakerRule[] {
    const rows = db.prepare('SELECT * FROM circuit_breaker_rules WHERE enabled = 1').all() as any[];
    return rows.map(row => this.rowToRule(row));
  }

  update(name: string, updates: Partial<CircuitBreakerRule>): void {
    const fields: string[] = [];
    const params: any = { name };

    if (updates.enabled !== undefined) {
      fields.push('enabled = @enabled');
      params.enabled = updates.enabled ? 1 : 0;
    }

    if (updates.condition !== undefined) {
      fields.push('condition = @condition');
      params.condition = updates.condition;
    }

    if (updates.window !== undefined) {
      fields.push('window = @window');
      params.window = updates.window;
    }

    if (updates.action !== undefined) {
      fields.push('action = @action');
      params.action = updates.action;
    }

    if (updates.alertSeverity !== undefined) {
      fields.push('alert_severity = @alertSeverity');
      params.alertSeverity = updates.alertSeverity;
    }

    fields.push("updated_at = datetime('now')");

    const sql = `UPDATE circuit_breaker_rules SET ${fields.join(', ')} WHERE name = @name`;
    db.prepare(sql).run(params);
  }

  private rowToRule(row: any): CircuitBreakerRule {
    return {
      name: row.name,
      enabled: row.enabled === 1,
      condition: row.condition,
      window: row.window,
      action: row.action,
      alertSeverity: row.alert_severity,
    };
  }
}

/**
 * Metrics snapshots repository
 */
export class MetricsSnapshotsRepo {
  save(metrics: AutonomyMetrics): void {
    db.prepare(`
      INSERT INTO metrics_snapshots (
        timestamp, period_start, period_end,
        commands_total, commands_proposed, commands_approved, commands_rejected,
        commands_succeeded, commands_failed, commands_rolled_back,
        success_rate, approval_rate, rollback_rate, error_rate,
        incidents_total, incidents_critical, incidents_from_autonomous,
        constraint_violations, emergency_aborts, safety_gate_triggers
      ) VALUES (
        datetime('now'), @periodStart, @periodEnd,
        @commandsTotal, @commandsProposed, @commandsApproved, @commandsRejected,
        @commandsSucceeded, @commandsFailed, @commandsRolledBack,
        @successRate, @approvalRate, @rollbackRate, @errorRate,
        @incidentsTotal, @incidentsCritical, @incidentsFromAutonomous,
        @constraintViolations, @emergencyAborts, @safetyGateTriggers
      )
    `).run({
      periodStart: metrics.period.start.toISOString(),
      periodEnd: metrics.period.end.toISOString(),
      commandsTotal: metrics.commands.total,
      commandsProposed: metrics.commands.proposed,
      commandsApproved: metrics.commands.approved,
      commandsRejected: metrics.commands.rejected,
      commandsSucceeded: metrics.commands.succeeded,
      commandsFailed: metrics.commands.failed,
      commandsRolledBack: metrics.commands.rolledBack,
      successRate: metrics.rates.successRate,
      approvalRate: metrics.rates.approvalRate,
      rollbackRate: metrics.rates.rollbackRate,
      errorRate: metrics.rates.errorRate,
      incidentsTotal: metrics.incidents.total,
      incidentsCritical: metrics.incidents.critical,
      incidentsFromAutonomous: metrics.incidents.fromAutonomousActions,
      constraintViolations: metrics.safety.constraintViolations,
      emergencyAborts: metrics.safety.emergencyAborts,
      safetyGateTriggers: metrics.safety.safetyGateTriggers,
    });
  }

  getLatest(): AutonomyMetrics | null {
    const row = db.prepare('SELECT * FROM metrics_snapshots ORDER BY timestamp DESC LIMIT 1').get() as any;
    if (!row) return null;

    return this.rowToMetrics(row);
  }

  private rowToMetrics(row: any): AutonomyMetrics {
    return {
      period: {
        start: new Date(row.period_start),
        end: new Date(row.period_end),
      },
      commands: {
        total: row.commands_total,
        proposed: row.commands_proposed,
        approved: row.commands_approved,
        rejected: row.commands_rejected,
        succeeded: row.commands_succeeded,
        failed: row.commands_failed,
        rolledBack: row.commands_rolled_back,
      },
      rates: {
        successRate: row.success_rate,
        approvalRate: row.approval_rate,
        rollbackRate: row.rollback_rate,
        errorRate: row.error_rate,
      },
      incidents: {
        total: row.incidents_total,
        critical: row.incidents_critical,
        fromAutonomousActions: row.incidents_from_autonomous,
      },
      safety: {
        constraintViolations: row.constraint_violations,
        emergencyAborts: row.emergency_aborts,
        safetyGateTriggers: row.safety_gate_triggers,
      },
    };
  }
}

/**
 * Readiness assessments repository
 */
export class ReadinessAssessmentsRepo {
  save(assessment: ReadinessReport): void {
    db.prepare(`
      INSERT INTO readiness_assessments (
        timestamp, current_phase, days_since_phase_start,
        overall_score, overall_ready, overall_blockers,
        technical_score, technical_max_score, technical_items,
        process_score, process_max_score, process_items,
        organizational_score, organizational_max_score, organizational_items,
        recommendations, next_actions
      ) VALUES (
        @timestamp, @currentPhase, @daysSincePhaseStart,
        @overallScore, @overallReady, @overallBlockers,
        @technicalScore, @technicalMaxScore, @technicalItems,
        @processScore, @processMaxScore, @processItems,
        @organizationalScore, @organizationalMaxScore, @organizationalItems,
        @recommendations, @nextActions
      )
    `).run({
      timestamp: assessment.timestamp.toISOString(),
      currentPhase: assessment.currentPhase,
      daysSincePhaseStart: assessment.daysSincePhaseStart,
      overallScore: assessment.overall.score,
      overallReady: assessment.overall.ready ? 1 : 0,
      overallBlockers: JSON.stringify(assessment.overall.blockers),
      technicalScore: assessment.technical.score,
      technicalMaxScore: assessment.technical.maxScore,
      technicalItems: JSON.stringify(assessment.technical.items),
      processScore: assessment.process.score,
      processMaxScore: assessment.process.maxScore,
      processItems: JSON.stringify(assessment.process.items),
      organizationalScore: assessment.organizational.score,
      organizationalMaxScore: assessment.organizational.maxScore,
      organizationalItems: JSON.stringify(assessment.organizational.items),
      recommendations: JSON.stringify(assessment.recommendations),
      nextActions: JSON.stringify(assessment.nextActions),
    });
  }

  getLatest(): ReadinessReport | null {
    const row = db.prepare('SELECT * FROM readiness_assessments ORDER BY timestamp DESC LIMIT 1').get() as any;
    if (!row) return null;

    return this.rowToAssessment(row);
  }

  private rowToAssessment(row: any): ReadinessReport {
    return {
      timestamp: new Date(row.timestamp),
      currentPhase: row.current_phase,
      daysSincePhaseStart: row.days_since_phase_start,
      overall: {
        score: row.overall_score,
        ready: row.overall_ready === 1,
        blockers: JSON.parse(row.overall_blockers),
      },
      technical: {
        score: row.technical_score,
        maxScore: row.technical_max_score,
        items: JSON.parse(row.technical_items),
      },
      process: {
        score: row.process_score,
        maxScore: row.process_max_score,
        items: JSON.parse(row.process_items),
      },
      organizational: {
        score: row.organizational_score,
        maxScore: row.organizational_max_score,
        items: JSON.parse(row.organizational_items),
      },
      recommendations: JSON.parse(row.recommendations),
      nextActions: JSON.parse(row.next_actions),
    };
  }
}

/**
 * Scope expansion proposals repository
 */
export class ScopeExpansionProposalsRepo {
  save(proposal: ScopeExpansionProposal): void {
    db.prepare(`
      INSERT INTO scope_expansion_proposals (
        proposal_id, timestamp, proposed_by,
        current_phase, target_phase, commands_to_whitelist, validation_period,
        metrics, readiness, key_achievements,
        risk_level, mitigations, rollback_plan,
        required_approvals, status
      ) VALUES (
        @proposalId, @timestamp, @proposedBy,
        @currentPhase, @targetPhase, @commandsToWhitelist, @validationPeriod,
        @metrics, @readiness, @keyAchievements,
        @riskLevel, @mitigations, @rollbackPlan,
        @requiredApprovals, @status
      )
    `).run({
      proposalId: proposal.proposalId,
      timestamp: proposal.timestamp.toISOString(),
      proposedBy: proposal.proposedBy,
      currentPhase: proposal.expansion.currentPhase,
      targetPhase: proposal.expansion.targetPhase,
      commandsToWhitelist: JSON.stringify(proposal.expansion.commandsToWhitelist),
      validationPeriod: proposal.expansion.validationPeriod,
      metrics: JSON.stringify(proposal.rationale.metrics),
      readiness: JSON.stringify(proposal.rationale.readiness),
      keyAchievements: JSON.stringify(proposal.rationale.keyAchievements),
      riskLevel: proposal.riskAssessment.level,
      mitigations: JSON.stringify(proposal.riskAssessment.mitigations),
      rollbackPlan: proposal.riskAssessment.rollbackPlan,
      requiredApprovals: JSON.stringify(proposal.requiredApprovals),
      status: 'pending',
    });
  }

  approve(proposalId: string, approvedBy: string): void {
    db.prepare(`
      UPDATE scope_expansion_proposals
      SET status = 'approved', approved_at = datetime('now'), approved_by = ?
      WHERE proposal_id = ?
    `).run(approvedBy, proposalId);
  }

  reject(proposalId: string): void {
    db.prepare(`
      UPDATE scope_expansion_proposals
      SET status = 'rejected'
      WHERE proposal_id = ?
    `).run(proposalId);
  }

  getPending(): ScopeExpansionProposal[] {
    const rows = db.prepare(`
      SELECT * FROM scope_expansion_proposals
      WHERE status = 'pending'
      ORDER BY timestamp DESC
    `).all() as any[];

    return rows.map(row => this.rowToProposal(row));
  }

  private rowToProposal(row: any): ScopeExpansionProposal {
    return {
      proposalId: row.proposal_id,
      timestamp: new Date(row.timestamp),
      proposedBy: row.proposed_by,
      expansion: {
        currentPhase: row.current_phase,
        targetPhase: row.target_phase,
        commandsToWhitelist: JSON.parse(row.commands_to_whitelist),
        validationPeriod: row.validation_period,
      },
      rationale: {
        metrics: JSON.parse(row.metrics),
        readiness: JSON.parse(row.readiness),
        keyAchievements: JSON.parse(row.key_achievements),
      },
      riskAssessment: {
        level: row.risk_level,
        mitigations: JSON.parse(row.mitigations),
        rollbackPlan: row.rollback_plan,
      },
      requiredApprovals: JSON.parse(row.required_approvals),
    };
  }
}
