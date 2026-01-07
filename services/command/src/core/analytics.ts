import type Database from "better-sqlite3";
import type {
  CommandMetrics,
  CommandTimeseriesMetrics,
  CommandAlert,
  CommandSummary,
  CommandProposal,
} from "@sim-corp/schemas";

export interface CommandAnalytics {
  getMetrics(startTime: string, endTime: string): CommandMetrics;
  getTimeseriesMetrics(
    metric: string,
    startTime: string,
    endTime: string,
    bucketSizeSeconds: number
  ): CommandTimeseriesMetrics;
  getAlerts(limit?: number): CommandAlert[];
  getSummary(): CommandSummary;
}

export function createCommandAnalytics(db: Database.Database): CommandAnalytics {
  return {
    getMetrics(startTime: string, endTime: string): CommandMetrics {
      // Get all proposals in time window
      const proposals = db
        .prepare(
          `SELECT * FROM command_proposals
           WHERE created_at >= ? AND created_at <= ?
           ORDER BY created_at DESC`
        )
        .all(startTime, endTime) as any[];

      const totalCommands = proposals.length;

      // Count by status
      const statusCounts = proposals.reduce(
        (acc, p) => {
          acc[p.status] = (acc[p.status] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      const completedCount = statusCounts.COMPLETED || 0;
      const failedCount = statusCounts.FAILED || 0;
      const rejectedCount = statusCounts.REJECTED || 0;
      const abortedCount = statusCounts.ABORTED || 0;

      // Calculate rates
      const successCount = completedCount;
      const failureCount = failedCount + abortedCount;
      const successRate = totalCommands > 0 ? successCount / totalCommands : 0;
      const failureRate = totalCommands > 0 ? failureCount / totalCommands : 0;
      const rejectionRate =
        totalCommands > 0 ? rejectedCount / totalCommands : 0;

      // Calculate latency metrics
      const executionDurations = proposals
        .filter((p) => p.execution_duration_ms != null)
        .map((p) => p.execution_duration_ms)
        .sort((a, b) => a - b);

      const avgExecutionDurationMs =
        executionDurations.length > 0
          ? executionDurations.reduce((a, b) => a + b, 0) /
            executionDurations.length
          : undefined;

      const p50ExecutionDurationMs =
        executionDurations.length > 0
          ? executionDurations[Math.floor(executionDurations.length * 0.5)]
          : undefined;

      const p95ExecutionDurationMs =
        executionDurations.length > 0
          ? executionDurations[Math.floor(executionDurations.length * 0.95)]
          : undefined;

      const p99ExecutionDurationMs =
        executionDurations.length > 0
          ? executionDurations[Math.floor(executionDurations.length * 0.99)]
          : undefined;

      const maxExecutionDurationMs =
        executionDurations.length > 0
          ? executionDurations[executionDurations.length - 1]
          : undefined;

      // Calculate approval latency
      const approvalLatencies = proposals
        .filter((p) => p.approved_at && p.created_at)
        .map(
          (p) =>
            new Date(p.approved_at).getTime() -
            new Date(p.created_at).getTime()
        );

      const avgApprovalLatencyMs =
        approvalLatencies.length > 0
          ? approvalLatencies.reduce((a, b) => a + b, 0) /
            approvalLatencies.length
          : undefined;

      // Breakdown by command type
      const byCommandType: Record<string, { count: number; successRate: number }> =
        {};
      proposals.forEach((p) => {
        const type = p.command_type;
        if (!byCommandType[type]) {
          byCommandType[type] = { count: 0, successRate: 0 };
        }
        byCommandType[type].count++;
      });

      // Calculate success rate for each command type
      Object.keys(byCommandType).forEach((type) => {
        const typeProposals = proposals.filter((p) => p.command_type === type);
        const typeSuccessCount = typeProposals.filter(
          (p) => p.status === "COMPLETED"
        ).length;
        byCommandType[type].successRate =
          typeProposals.length > 0 ? typeSuccessCount / typeProposals.length : 0;
      });

      // Breakdown by machine
      const byMachine: Record<string, { count: number; successRate: number }> = {};
      proposals.forEach((p) => {
        const machine = p.machine_id;
        if (!byMachine[machine]) {
          byMachine[machine] = { count: 0, successRate: 0 };
        }
        byMachine[machine].count++;
      });

      // Calculate success rate for each machine
      Object.keys(byMachine).forEach((machine) => {
        const machineProposals = proposals.filter(
          (p) => p.machine_id === machine
        );
        const machineSuccessCount = machineProposals.filter(
          (p) => p.status === "COMPLETED"
        ).length;
        byMachine[machine].successRate =
          machineProposals.length > 0
            ? machineSuccessCount / machineProposals.length
            : 0;
      });

      return {
        startTime,
        endTime,
        totalCommands,
        proposedCount: statusCounts.PROPOSED || 0,
        pendingApprovalCount: statusCounts.PENDING_APPROVAL || 0,
        approvedCount: statusCounts.APPROVED || 0,
        rejectedCount,
        executingCount: statusCounts.EXECUTING || 0,
        completedCount,
        failedCount,
        abortedCount,
        timeoutCount: statusCounts.TIMEOUT || 0,
        successRate,
        failureRate,
        rejectionRate,
        avgApprovalLatencyMs,
        avgExecutionDurationMs,
        p50ExecutionDurationMs,
        p95ExecutionDurationMs,
        p99ExecutionDurationMs,
        maxExecutionDurationMs,
        byCommandType,
        byMachine,
        safetyViolations: 0, // TODO: Track from rejection reasons
        constraintViolations: 0, // TODO: Track from rejection reasons
        rateLimitHits: 0, // TODO: Track from rejection reasons
      };
    },

    getTimeseriesMetrics(
      metric: string,
      startTime: string,
      endTime: string,
      bucketSizeSeconds: number
    ): CommandTimeseriesMetrics {
      const startMs = new Date(startTime).getTime();
      const endMs = new Date(endTime).getTime();
      const bucketMs = bucketSizeSeconds * 1000;

      const buckets: Record<number, any[]> = {};

      // Get all proposals in time window
      const proposals = db
        .prepare(
          `SELECT * FROM command_proposals
           WHERE created_at >= ? AND created_at <= ?
           ORDER BY created_at ASC`
        )
        .all(startTime, endTime) as any[];

      // Group by bucket
      proposals.forEach((p) => {
        const timestamp = new Date(p.created_at).getTime();
        const bucketStart = Math.floor((timestamp - startMs) / bucketMs) * bucketMs + startMs;
        if (!buckets[bucketStart]) {
          buckets[bucketStart] = [];
        }
        buckets[bucketStart].push(p);
      });

      // Calculate metric for each bucket
      const dataPoints = Object.keys(buckets)
        .map((bucketStartStr) => {
          const bucketStart = parseInt(bucketStartStr, 10);
          const bucketProposals = buckets[bucketStart];

          let value = 0;

          switch (metric) {
            case "command_count":
              value = bucketProposals.length;
              break;

            case "success_rate": {
              const successCount = bucketProposals.filter(
                (p) => p.status === "COMPLETED"
              ).length;
              value =
                bucketProposals.length > 0
                  ? successCount / bucketProposals.length
                  : 0;
              break;
            }

            case "failure_rate": {
              const failureCount = bucketProposals.filter(
                (p) => p.status === "FAILED" || p.status === "ABORTED"
              ).length;
              value =
                bucketProposals.length > 0
                  ? failureCount / bucketProposals.length
                  : 0;
              break;
            }

            case "avg_execution_duration_ms": {
              const durations = bucketProposals
                .filter((p) => p.execution_duration_ms != null)
                .map((p) => p.execution_duration_ms);
              value =
                durations.length > 0
                  ? durations.reduce((a, b) => a + b, 0) / durations.length
                  : 0;
              break;
            }

            case "avg_approval_latency_ms": {
              const latencies = bucketProposals
                .filter((p) => p.approved_at && p.created_at)
                .map(
                  (p) =>
                    new Date(p.approved_at).getTime() -
                    new Date(p.created_at).getTime()
                );
              value =
                latencies.length > 0
                  ? latencies.reduce((a, b) => a + b, 0) / latencies.length
                  : 0;
              break;
            }

            case "safety_violations":
              // TODO: Count from rejection reasons
              value = 0;
              break;
          }

          return {
            timestamp: new Date(bucketStart).toISOString(),
            value,
          };
        })
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      return {
        metric: metric as any,
        startTime,
        endTime,
        bucketSizeSeconds,
        dataPoints,
      };
    },

    getAlerts(limit: number = 100): CommandAlert[] {
      // For now, generate alerts based on metrics
      // In production, these would be stored in a dedicated alerts table
      const alerts: CommandAlert[] = [];

      // Check for recent high failure rate
      const last1Hour = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const now = new Date().toISOString();
      const recentMetrics = this.getMetrics(last1Hour, now);

      if (recentMetrics.failureRate > 0.2) {
        alerts.push({
          alertId: `alert-high-failure-${Date.now()}`,
          severity: "WARNING",
          alertType: "HIGH_FAILURE_RATE",
          title: "High Command Failure Rate",
          message: `Command failure rate (${(recentMetrics.failureRate * 100).toFixed(1)}%) exceeded 20% threshold in the last hour`,
          timestamp: now,
          metadata: {
            threshold: 0.2,
            currentRate: recentMetrics.failureRate,
            failedCount: recentMetrics.failedCount,
            totalCount: recentMetrics.totalCommands,
          },
        });
      }

      // Check for high latency
      if (
        recentMetrics.avgExecutionDurationMs &&
        recentMetrics.avgExecutionDurationMs > 5000
      ) {
        alerts.push({
          alertId: `alert-high-latency-${Date.now()}`,
          severity: "WARNING",
          alertType: "HIGH_LATENCY",
          title: "High Command Execution Latency",
          message: `Average execution latency (${recentMetrics.avgExecutionDurationMs.toFixed(0)}ms) exceeded 5000ms threshold`,
          timestamp: now,
          metadata: {
            threshold: 5000,
            currentLatency: recentMetrics.avgExecutionDurationMs,
          },
        });
      }

      return alerts.slice(0, limit);
    },

    getSummary(): CommandSummary {
      const now = new Date().toISOString();
      const last24HoursStart = new Date(
        Date.now() - 24 * 60 * 60 * 1000
      ).toISOString();
      const last7DaysStart = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000
      ).toISOString();

      const last24Hours = this.getMetrics(last24HoursStart, now);
      const last7Days = this.getMetrics(last7DaysStart, now);

      // Get pending approvals
      const pendingApprovals =
        db
          .prepare(
            "SELECT COUNT(*) as count FROM command_proposals WHERE status = 'PENDING_APPROVAL'"
          )
          .get() as any;

      // Get active executions
      const activeExecutions =
        db
          .prepare(
            "SELECT COUNT(*) as count FROM command_proposals WHERE status = 'EXECUTING'"
          )
          .get() as any;

      // Get recent failures (last hour)
      const last1HourStart = new Date(
        Date.now() - 60 * 60 * 1000
      ).toISOString();
      const recentFailures =
        db
          .prepare(
            `SELECT COUNT(*) as count FROM command_proposals
             WHERE status IN ('FAILED', 'ABORTED') AND created_at >= ?`
          )
          .get(last1HourStart) as any;

      // Get top command types
      const topCommandTypeRows = db
        .prepare(
          `SELECT command_type, COUNT(*) as count
           FROM command_proposals
           WHERE created_at >= ?
           GROUP BY command_type
           ORDER BY count DESC
           LIMIT 5`
        )
        .all(last24HoursStart) as any[];

      const topCommandTypes = topCommandTypeRows.map((row) => {
        const typeProposals = db
          .prepare(
            `SELECT status FROM command_proposals
             WHERE command_type = ? AND created_at >= ?`
          )
          .all(row.command_type, last24HoursStart) as any[];

        const successCount = typeProposals.filter(
          (p) => p.status === "COMPLETED"
        ).length;
        const successRate =
          typeProposals.length > 0 ? successCount / typeProposals.length : 0;

        return {
          commandType: row.command_type,
          count: row.count,
          successRate,
        };
      });

      return {
        pendingApprovals: pendingApprovals?.count || 0,
        activeExecutions: activeExecutions?.count || 0,
        recentFailures: recentFailures?.count || 0,
        last24Hours,
        last7Days,
        activeAlerts: this.getAlerts(10),
        topCommandTypes,
        generatedAt: now,
      };
    },
  };
}
