/**
 * MetricsCollector - Collects autonomy metrics from various sources
 *
 * Aggregates data from:
 * - Command service (proposals, executions)
 * - Eval service (coverage metrics)
 * - Incident tracking (when implemented)
 */

import type { AutonomyMetrics, TimeRange } from '@sim-corp/schemas/kernel/governance';
import Database from 'better-sqlite3';

export interface MetricsCollectorConfig {
  commandDbPath: string;
  readonly?: boolean;
}

export class MetricsCollector {
  private commandDb: Database.Database;

  constructor(config: MetricsCollectorConfig) {
    // In-memory databases cannot be readonly
    const options = config.commandDbPath === ':memory:' ? {} : { readonly: config.readonly !== false };
    this.commandDb = new Database(config.commandDbPath, options);
  }

  /**
   * Collect all autonomy metrics for a given time range
   */
  async collectAll(timeRange: TimeRange): Promise<AutonomyMetrics> {
    const commandMetrics = this.collectCommandMetrics(timeRange);
    const incidentMetrics = this.collectIncidentMetrics(timeRange);
    const safetyMetrics = this.collectSafetyMetrics(timeRange);

    return {
      period: timeRange,
      commands: commandMetrics.commands,
      rates: commandMetrics.rates,
      incidents: incidentMetrics,
      safety: safetyMetrics,
    };
  }

  /**
   * Collect command execution metrics
   */
  private collectCommandMetrics(timeRange: TimeRange): {
    commands: AutonomyMetrics['commands'];
    rates: AutonomyMetrics['rates'];
  } {
    // Query command proposals within time range
    const proposals = this.commandDb.prepare(`
      SELECT
        status,
        execution_status,
        COUNT(*) as count
      FROM command_proposals
      WHERE created_at BETWEEN ? AND ?
      GROUP BY status, execution_status
    `).all(timeRange.start.toISOString(), timeRange.end.toISOString()) as any[];

    // Aggregate counts
    let total = 0;
    let proposed = 0;
    let approved = 0;
    let rejected = 0;
    let succeeded = 0;
    let failed = 0;
    let rolledBack = 0;

    for (const row of proposals) {
      const count = row.count;
      total += count;

      // Count by proposal status
      if (row.status === 'pending' || row.status === 'approved' || row.status === 'rejected' || row.status === 'executed') {
        proposed += count;
      }

      if (row.status === 'approved' || row.status === 'executed') {
        approved += count;
      }

      if (row.status === 'rejected') {
        rejected += count;
      }

      // Count by execution status
      if (row.execution_status === 'succeeded') {
        succeeded += count;
      }

      if (row.execution_status === 'failed') {
        failed += count;
      }

      if (row.execution_status === 'rolled_back') {
        rolledBack += count;
      }
    }

    // Calculate rates (avoid division by zero)
    const successRate = (succeeded + failed) > 0 ? succeeded / (succeeded + failed) : 0;
    const approvalRate = proposed > 0 ? approved / proposed : 0;
    const rollbackRate = succeeded > 0 ? rolledBack / succeeded : 0;
    const errorRate = total > 0 ? failed / total : 0;

    return {
      commands: {
        total,
        proposed,
        approved,
        rejected,
        succeeded,
        failed,
        rolledBack,
      },
      rates: {
        successRate,
        approvalRate,
        rollbackRate,
        errorRate,
      },
    };
  }

  /**
   * Collect incident metrics
   * Note: Placeholder implementation - would integrate with incident tracking system
   */
  private collectIncidentMetrics(timeRange: TimeRange): AutonomyMetrics['incidents'] {
    // Placeholder: In production, this would query an incident tracking database
    // For now, we'll infer incidents from command failures
    const criticalFailures = this.commandDb.prepare(`
      SELECT COUNT(*) as count
      FROM command_proposals
      WHERE created_at BETWEEN ? AND ?
        AND execution_status = 'failed'
        AND json_extract(command, '$.type') IN ('EMERGENCY_SHUTDOWN', 'ABORT')
    `).get(timeRange.start.toISOString(), timeRange.end.toISOString()) as any;

    return {
      total: criticalFailures?.count || 0,
      critical: criticalFailures?.count || 0,
      fromAutonomousActions: 0, // Would need autonomous command tracking
    };
  }

  /**
   * Collect safety metrics
   */
  private collectSafetyMetrics(timeRange: TimeRange): AutonomyMetrics['safety'] {
    // Count constraint violations (rejections due to constraint checks)
    const constraintViolations = this.commandDb.prepare(`
      SELECT COUNT(*) as count
      FROM command_proposals
      WHERE created_at BETWEEN ? AND ?
        AND status = 'rejected'
        AND rejection_reason LIKE '%constraint%'
    `).get(timeRange.start.toISOString(), timeRange.end.toISOString()) as any;

    // Count emergency aborts (ABORT commands)
    const emergencyAborts = this.commandDb.prepare(`
      SELECT COUNT(*) as count
      FROM command_proposals
      WHERE created_at BETWEEN ? AND ?
        AND json_extract(command, '$.type') = 'ABORT'
    `).get(timeRange.start.toISOString(), timeRange.end.toISOString()) as any;

    // Count safety gate triggers (rejections due to safety gates)
    const safetyGates = this.commandDb.prepare(`
      SELECT COUNT(*) as count
      FROM command_proposals
      WHERE created_at BETWEEN ? AND ?
        AND status = 'rejected'
        AND (rejection_reason LIKE '%safety%' OR rejection_reason LIKE '%gate%')
    `).get(timeRange.start.toISOString(), timeRange.end.toISOString()) as any;

    return {
      constraintViolations: constraintViolations?.count || 0,
      emergencyAborts: emergencyAborts?.count || 0,
      safetyGateTriggers: safetyGates?.count || 0,
    };
  }

  /**
   * Get eval coverage metrics
   * Note: Placeholder - would integrate with eval service
   */
  async getEvalCoverage(): Promise<{ coverage: number; totalGoldenCases: number }> {
    // Placeholder: Would query eval service API
    return {
      coverage: 0.0,
      totalGoldenCases: 0,
    };
  }

  /**
   * Close database connections
   */
  close(): void {
    this.commandDb.close();
  }
}

/**
 * Create metrics collector from environment
 */
export function createMetricsCollector(): MetricsCollector {
  const commandDbPath = process.env.COMMAND_DB_PATH || '../command/var/command.db';

  return new MetricsCollector({
    commandDbPath,
  });
}
