import type { FastifyInstance } from "fastify";
import type { CommandAnalytics } from "../core/analytics.js";

export async function analyticsRoutes(
  fastify: FastifyInstance,
  opts: { analytics: CommandAnalytics }
) {
  const { analytics } = opts;

  // GET /analytics/metrics - Get aggregated metrics for a time window
  fastify.get("/analytics/metrics", async (request, reply) => {
    const query = request.query as any;

    const startTime = query.startTime || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const endTime = query.endTime || new Date().toISOString();

    try {
      const metrics = analytics.getMetrics(startTime, endTime);
      return metrics;
    } catch (error) {
      reply.status(400).send({
        error: "Failed to get metrics",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // GET /analytics/metrics/timeseries - Get time-bucketed metrics
  fastify.get("/analytics/metrics/timeseries", async (request, reply) => {
    const query = request.query as any;

    const metric = query.metric || "command_count";
    const startTime = query.startTime || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const endTime = query.endTime || new Date().toISOString();
    const bucketSizeSeconds = parseInt(query.bucketSizeSeconds || "300", 10); // Default 5 minutes

    const validMetrics = [
      "command_count",
      "success_rate",
      "failure_rate",
      "avg_execution_duration_ms",
      "avg_approval_latency_ms",
      "safety_violations",
    ];

    if (!validMetrics.includes(metric)) {
      reply.status(400).send({
        error: "Invalid metric",
        details: `Metric must be one of: ${validMetrics.join(", ")}`,
      });
      return;
    }

    try {
      const timeseries = analytics.getTimeseriesMetrics(
        metric,
        startTime,
        endTime,
        bucketSizeSeconds
      );
      return timeseries;
    } catch (error) {
      reply.status(400).send({
        error: "Failed to get timeseries metrics",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // GET /analytics/alerts - Get recent alerts
  fastify.get("/analytics/alerts", async (request, reply) => {
    const query = request.query as any;
    const limit = parseInt(query.limit || "100", 10);

    try {
      const alerts = analytics.getAlerts(limit);
      return alerts;
    } catch (error) {
      reply.status(400).send({
        error: "Failed to get alerts",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // GET /analytics/summary - Get dashboard summary
  fastify.get("/analytics/summary", async (request, reply) => {
    try {
      const summary = analytics.getSummary();
      return summary;
    } catch (error) {
      reply.status(400).send({
        error: "Failed to get summary",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
