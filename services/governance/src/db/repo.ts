/**
 * Repository for governance data access
 * Uses async database abstraction layer
 */

import type { Database } from '@sim-corp/database';
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
  constructor(private db: Database) {}

  async getState(): Promise<GovernanceState | null> {
    const result = await this.db.query('SELECT * FROM governance_state WHERE id = 1');
    if (result.rows.length === 0) return null;

    const row: any = result.rows[0];
    return {
      currentPhase: row.current_phase,
      phaseStartDate: new Date(row.phase_start_date),
      commandWhitelist: JSON.parse(row.command_whitelist),
      lastReportDate: row.last_report_date ? new Date(row.last_report_date) : undefined,
      lastExpansionDate: row.last_expansion_date ? new Date(row.last_expansion_date) : undefined,
    };
  }

  async updateState(state: Partial<GovernanceState>): Promise<void> {
    const updates: string[] = [];
    const params: any[] = [];

    if (state.currentPhase !== undefined) {
      updates.push('current_phase = ?');
      params.push(state.currentPhase);
    }

    if (state.phaseStartDate !== undefined) {
      updates.push('phase_start_date = ?');
      params.push(state.phaseStartDate.toISOString());
    }

    if (state.commandWhitelist !== undefined) {
      updates.push('command_whitelist = ?');
      params.push(JSON.stringify(state.commandWhitelist));
    }

    if (state.lastReportDate !== undefined) {
      updates.push('last_report_date = ?');
      params.push(state.lastReportDate.toISOString());
    }

    if (state.lastExpansionDate !== undefined) {
      updates.push('last_expansion_date = ?');
      params.push(state.lastExpansionDate.toISOString());
    }

    if (this.db.type === 'sqlite') {
      updates.push("updated_at = datetime('now')");
    } else {
      updates.push('updated_at = NOW()');
    }

    const sql = `UPDATE governance_state SET ${updates.join(', ')} WHERE id = 1`;
    await this.db.exec(sql, params);
  }
}

/**
 * Governance reports repository
 */
export class GovernanceReportsRepo {
  constructor(private db: Database) {}

  async save(report: GovernanceReport): Promise<void> {
    await this.db.exec(
      `
      INSERT INTO governance_reports (
        id, week_start, week_end, generated_at,
        metrics, readiness, expansion, circuit_breaker_events,
        summary, recommendations, next_actions
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        report.id,
        report.weekStart.toISOString(),
        report.weekEnd.toISOString(),
        report.generatedAt.toISOString(),
        JSON.stringify(report.metrics),
        JSON.stringify(report.readiness),
        report.expansion ? JSON.stringify(report.expansion) : null,
        JSON.stringify(report.circuitBreakerEvents),
        report.summary,
        JSON.stringify(report.recommendations),
        JSON.stringify(report.nextActions),
      ]
    );
  }

  async getById(id: string): Promise<GovernanceReport | null> {
    const result = await this.db.query('SELECT * FROM governance_reports WHERE id = ?', [id]);
    if (result.rows.length === 0) return null;

    return this.rowToReport(result.rows[0]);
  }

  async getLatest(): Promise<GovernanceReport | null> {
    const result = await this.db.query('SELECT * FROM governance_reports ORDER BY week_end DESC LIMIT 1');
    if (result.rows.length === 0) return null;

    return this.rowToReport(result.rows[0]);
  }

  async getAll(limit = 10): Promise<GovernanceReport[]> {
    const result = await this.db.query('SELECT * FROM governance_reports ORDER BY week_end DESC LIMIT ?', [limit]);
    return result.rows.map(row => this.rowToReport(row));
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
  constructor(private db: Database) {}

  async save(event: CircuitBreakerEvent): Promise<void> {
    await this.db.exec(
      `
      INSERT INTO circuit_breaker_events (
        id, timestamp, rule, metrics, action, details, resolved, resolved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        event.id,
        event.timestamp.toISOString(),
        JSON.stringify(event.rule),
        JSON.stringify(event.metrics),
        event.action,
        event.details,
        event.resolved ? 1 : 0,
        event.resolvedAt ? event.resolvedAt.toISOString() : null,
      ]
    );
  }

  async resolve(id: string): Promise<void> {
    const sql =
      this.db.type === 'sqlite'
        ? `UPDATE circuit_breaker_events SET resolved = 1, resolved_at = datetime('now') WHERE id = ?`
        : `UPDATE circuit_breaker_events SET resolved = 1, resolved_at = NOW() WHERE id = ?`;

    await this.db.exec(sql, [id]);
  }

  async getUnresolved(): Promise<CircuitBreakerEvent[]> {
    const result = await this.db.query(`
      SELECT * FROM circuit_breaker_events
      WHERE resolved = 0
      ORDER BY timestamp DESC
    `);

    return result.rows.map(row => this.rowToEvent(row));
  }

  async getRecent(limit = 10): Promise<CircuitBreakerEvent[]> {
    const result = await this.db.query(
      `
      SELECT * FROM circuit_breaker_events
      ORDER BY timestamp DESC
      LIMIT ?
    `,
      [limit]
    );

    return result.rows.map(row => this.rowToEvent(row));
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
  constructor(private db: Database) {}

  async getAll(): Promise<CircuitBreakerRule[]> {
    const result = await this.db.query('SELECT * FROM circuit_breaker_rules');
    return result.rows.map(row => this.rowToRule(row));
  }

  async getEnabled(): Promise<CircuitBreakerRule[]> {
    const result = await this.db.query('SELECT * FROM circuit_breaker_rules WHERE enabled = 1');
    return result.rows.map(row => this.rowToRule(row));
  }

  async update(name: string, updates: Partial<CircuitBreakerRule>): Promise<void> {
    const fields: string[] = [];
    const params: any[] = [];

    if (updates.enabled !== undefined) {
      fields.push('enabled = ?');
      params.push(updates.enabled ? 1 : 0);
    }

    if (updates.condition !== undefined) {
      fields.push('condition = ?');
      params.push(updates.condition);
    }

    if (updates.window !== undefined) {
      fields.push('window = ?');
      params.push(updates.window);
    }

    if (updates.action !== undefined) {
      fields.push('action = ?');
      params.push(updates.action);
    }

    if (updates.alertSeverity !== undefined) {
      fields.push('alert_severity = ?');
      params.push(updates.alertSeverity);
    }

    if (this.db.type === 'sqlite') {
      fields.push("updated_at = datetime('now')");
    } else {
      fields.push('updated_at = NOW()');
    }

    params.push(name); // WHERE clause parameter

    const sql = `UPDATE circuit_breaker_rules SET ${fields.join(', ')} WHERE name = ?`;
    await this.db.exec(sql, params);
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
  constructor(private db: Database) {}

  async save(metrics: AutonomyMetrics): Promise<void> {
    const timestampSql = this.db.type === 'sqlite' ? "datetime('now')" : 'NOW()';

    await this.db.execRaw(`
      INSERT INTO metrics_snapshots (
        timestamp, period_start, period_end,
        commands_total, commands_proposed, commands_approved, commands_rejected,
        commands_succeeded, commands_failed, commands_rolled_back,
        success_rate, approval_rate, rollback_rate, error_rate,
        incidents_total, incidents_critical, incidents_from_autonomous,
        constraint_violations, emergency_aborts, safety_gate_triggers
      ) VALUES (
        ${timestampSql}, '${metrics.period.start.toISOString()}', '${metrics.period.end.toISOString()}',
        ${metrics.commands.total}, ${metrics.commands.proposed}, ${metrics.commands.approved}, ${metrics.commands.rejected},
        ${metrics.commands.succeeded}, ${metrics.commands.failed}, ${metrics.commands.rolledBack},
        ${metrics.rates.successRate}, ${metrics.rates.approvalRate}, ${metrics.rates.rollbackRate}, ${metrics.rates.errorRate},
        ${metrics.incidents.total}, ${metrics.incidents.critical}, ${metrics.incidents.fromAutonomousActions},
        ${metrics.safety.constraintViolations}, ${metrics.safety.emergencyAborts}, ${metrics.safety.safetyGateTriggers}
      )
    `);
  }

  async getLatest(): Promise<AutonomyMetrics | null> {
    const result = await this.db.query('SELECT * FROM metrics_snapshots ORDER BY timestamp DESC LIMIT 1');
    if (result.rows.length === 0) return null;

    return this.rowToMetrics(result.rows[0]);
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
  constructor(private db: Database) {}

  async save(assessment: ReadinessReport): Promise<void> {
    await this.db.exec(
      `
      INSERT INTO readiness_assessments (
        timestamp, current_phase, days_since_phase_start,
        overall_score, overall_ready, overall_blockers,
        technical_score, technical_max_score, technical_items,
        process_score, process_max_score, process_items,
        organizational_score, organizational_max_score, organizational_items,
        recommendations, next_actions
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        assessment.timestamp.toISOString(),
        assessment.currentPhase,
        assessment.daysSincePhaseStart,
        assessment.overall.score,
        assessment.overall.ready ? 1 : 0,
        JSON.stringify(assessment.overall.blockers),
        assessment.technical.score,
        assessment.technical.maxScore,
        JSON.stringify(assessment.technical.items),
        assessment.process.score,
        assessment.process.maxScore,
        JSON.stringify(assessment.process.items),
        assessment.organizational.score,
        assessment.organizational.maxScore,
        JSON.stringify(assessment.organizational.items),
        JSON.stringify(assessment.recommendations),
        JSON.stringify(assessment.nextActions),
      ]
    );
  }

  async getLatest(): Promise<ReadinessReport | null> {
    const result = await this.db.query('SELECT * FROM readiness_assessments ORDER BY timestamp DESC LIMIT 1');
    if (result.rows.length === 0) return null;

    return this.rowToAssessment(result.rows[0]);
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
  constructor(private db: Database) {}

  async save(proposal: ScopeExpansionProposal): Promise<void> {
    await this.db.exec(
      `
      INSERT INTO scope_expansion_proposals (
        proposal_id, timestamp, proposed_by,
        current_phase, target_phase, commands_to_whitelist, validation_period,
        metrics, readiness, key_achievements,
        risk_level, mitigations, rollback_plan,
        required_approvals, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        proposal.proposalId,
        proposal.timestamp.toISOString(),
        proposal.proposedBy,
        proposal.expansion.currentPhase,
        proposal.expansion.targetPhase,
        JSON.stringify(proposal.expansion.commandsToWhitelist),
        proposal.expansion.validationPeriod,
        JSON.stringify(proposal.rationale.metrics),
        JSON.stringify(proposal.rationale.readiness),
        JSON.stringify(proposal.rationale.keyAchievements),
        proposal.riskAssessment.level,
        JSON.stringify(proposal.riskAssessment.mitigations),
        proposal.riskAssessment.rollbackPlan,
        JSON.stringify(proposal.requiredApprovals),
        'pending',
      ]
    );
  }

  async approve(proposalId: string, approvedBy: string): Promise<void> {
    const sql =
      this.db.type === 'sqlite'
        ? `UPDATE scope_expansion_proposals SET status = 'approved', approved_at = datetime('now'), approved_by = ? WHERE proposal_id = ?`
        : `UPDATE scope_expansion_proposals SET status = 'approved', approved_at = NOW(), approved_by = ? WHERE proposal_id = ?`;

    await this.db.exec(sql, [approvedBy, proposalId]);
  }

  async reject(proposalId: string): Promise<void> {
    await this.db.exec(
      `
      UPDATE scope_expansion_proposals
      SET status = 'rejected'
      WHERE proposal_id = ?
    `,
      [proposalId]
    );
  }

  async getPending(): Promise<ScopeExpansionProposal[]> {
    const result = await this.db.query(`
      SELECT * FROM scope_expansion_proposals
      WHERE status = 'pending'
      ORDER BY timestamp DESC
    `);

    return result.rows.map(row => this.rowToProposal(row));
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
