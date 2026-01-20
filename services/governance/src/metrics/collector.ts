/**
 * MetricsCollector - Collects autonomy metrics from various sources
 *
 * Aggregates data from:
 * - Command service (proposals, executions)
 * - Eval service (coverage metrics)
 * - Incident tracking (when implemented)
 */

import type { AutonomyMetrics, TimeRange } from '@sim-corp/schemas/kernel/governance';
import { createDatabase, type Database } from '@sim-corp/database';

export interface MetricsCollectorConfig {
  commandDbPath: string;
  readonly?: boolean;
}

export class MetricsCollector {
  private commandDb: Database;

  constructor(config: MetricsCollectorConfig, commandDb: Database) {
    this.commandDb = commandDb;
  }

  /**
   * Collect all autonomy metrics for a given time range
   */
  async collectAll(timeRange: TimeRange): Promise<AutonomyMetrics> {
    const commandMetrics = await this.collectCommandMetrics(timeRange);
    const incidentMetrics = await this.collectIncidentMetrics(timeRange);
    const safetyMetrics = await this.collectSafetyMetrics(timeRange);

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
  private async collectCommandMetrics(timeRange: TimeRange): Promise<{
    commands: AutonomyMetrics['commands'];
    rates: AutonomyMetrics['rates'];
  }> {
    // Query command proposals within time range
    console.log(`[MetricsCollector] Querying commands between ${timeRange.start.toISOString()} and ${timeRange.end.toISOString()}`);

    const dateTimeFunc = this.commandDb.type === 'sqlite' ? 'datetime' : 'to_timestamp';
    const betweenClause = this.commandDb.type === 'sqlite'
      ? `datetime(created_at) BETWEEN datetime(?) AND datetime(?)`
      : `created_at BETWEEN to_timestamp(?, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AND to_timestamp(?, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

    const result = await this.commandDb.query(`
      SELECT
        status,
        execution_status,
        COUNT(*) as count
      FROM command_proposals
      WHERE ${betweenClause}
      GROUP BY status, execution_status
    `, [timeRange.start.toISOString(), timeRange.end.toISOString()]);

    const proposals = result.rows as any[];
    console.log(`[MetricsCollector] Found ${proposals.length} groups of proposals`);

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
  private async collectIncidentMetrics(timeRange: TimeRange): Promise<AutonomyMetrics['incidents']> {
    // Placeholder: In production, this would query an incident tracking database
    // For now, we'll infer incidents from command failures
    const betweenClause = this.commandDb.type === 'sqlite'
      ? `datetime(created_at) BETWEEN datetime(?) AND datetime(?)`
      : `created_at BETWEEN to_timestamp(?, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AND to_timestamp(?, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

    const jsonExtract = this.commandDb.type === 'sqlite'
      ? `json_extract(command, '$.type')`
      : `command->>'type'`;

    const result = await this.commandDb.query(`
      SELECT COUNT(*) as count
      FROM command_proposals
      WHERE ${betweenClause}
        AND execution_status = 'failed'
        AND ${jsonExtract} IN ('EMERGENCY_SHUTDOWN', 'ABORT')
    `, [timeRange.start.toISOString(), timeRange.end.toISOString()]);

    const criticalFailures = result.rows[0] as any;

    return {
      total: criticalFailures?.count || 0,
      critical: criticalFailures?.count || 0,
      fromAutonomousActions: 0, // Would need autonomous command tracking
    };
  }

  /**
   * Collect safety metrics
   */
  private async collectSafetyMetrics(timeRange: TimeRange): Promise<AutonomyMetrics['safety']> {
    const betweenClause = this.commandDb.type === 'sqlite'
      ? `datetime(created_at) BETWEEN datetime(?) AND datetime(?)`
      : `created_at BETWEEN to_timestamp(?, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AND to_timestamp(?, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

    const jsonExtract = this.commandDb.type === 'sqlite'
      ? `json_extract(command, '$.type')`
      : `command->>'type'`;

    // Count constraint violations (rejections due to constraint checks)
    const constraintResult = await this.commandDb.query(`
      SELECT COUNT(*) as count
      FROM command_proposals
      WHERE ${betweenClause}
        AND status = 'rejected'
        AND rejection_reason LIKE '%constraint%'
    `, [timeRange.start.toISOString(), timeRange.end.toISOString()]);
    const constraintViolations = constraintResult.rows[0] as any;

    // Count emergency aborts (ABORT commands)
    const abortsResult = await this.commandDb.query(`
      SELECT COUNT(*) as count
      FROM command_proposals
      WHERE ${betweenClause}
        AND ${jsonExtract} = 'ABORT'
    `, [timeRange.start.toISOString(), timeRange.end.toISOString()]);
    const emergencyAborts = abortsResult.rows[0] as any;

    // Count safety gate triggers (rejections due to safety gates)
    const gatesResult = await this.commandDb.query(`
      SELECT COUNT(*) as count
      FROM command_proposals
      WHERE ${betweenClause}
        AND status = 'rejected'
        AND (rejection_reason LIKE '%safety%' OR rejection_reason LIKE '%gate%')
    `, [timeRange.start.toISOString(), timeRange.end.toISOString()]);
    const safetyGates = gatesResult.rows[0] as any;

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
  async close(): Promise<void> {
    await this.commandDb.close();
  }
}

/**
 * Create metrics collector from environment
 */
export async function createMetricsCollector(): Promise<MetricsCollector> {
  const commandDbPath = process.env.COMMAND_DB_PATH || '../command/var/command.db';

  // Create database connection for command service database
  const commandDb = await createDatabase({
    type: 'sqlite',
    path: commandDbPath,
    schema: '', // Read-only access, no schema initialization needed
    logger: {
      error: (msg: string) => console.error(`[MetricsCollector] ${msg}`),
      warn: (msg: string) => console.warn(`[MetricsCollector] ${msg}`),
      info: (msg: string) => console.log(`[MetricsCollector] ${msg}`),
    },
  });

  return new MetricsCollector({ commandDbPath }, commandDb);
}
