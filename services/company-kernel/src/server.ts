import Fastify, { type FastifyInstance } from "fastify";
import { registerHealthRoutes } from "./routes/health";
import { registerAgentRoutes } from "./routes/agents";
import { registerToolRoutes } from "./routes/tools";
import { registerPolicyRoutes } from "./routes/policy";
import { registerTraceRoutes } from "./routes/traces";
import { Registry } from "./core/registry";
import { PolicyEngine } from "./core/policy";
import { TraceStore } from "./core/traces";
import { MissionStore } from "./core/mission-store";
import { registerMissionRoutes } from "./routes/missions";
import { openKernelDatabase } from "./db/connection";
import { MissionRepository } from "./db/repo";
import { GovernorConfigStore } from "./core/governor/config";
import { RateLimiter } from "./core/governor/rate-limit";
import { GovernorEngine } from "./core/governor/engine";
import { registerGovernorRoutes } from "./routes/governor";
import { registerAuth } from "./auth";
import { initializeMetrics, metricsHandler, createCounter, createGauge, Registry as PrometheusRegistry } from "@sim-corp/metrics";

interface BuildServerOptions {
  missionStore?: MissionStore;
  dbPath?: string;
}

export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  registerAuth(app);

  // Use a fresh Prometheus registry for each server instance (fixes test isolation)
  const metricsRegistry = new PrometheusRegistry();

  // Initialize Prometheus metrics
  const httpMetrics = initializeMetrics({
    serviceName: 'company-kernel',
    collectDefaultMetrics: true,
    prefix: 'simcorp',
    registry: metricsRegistry,
  });

  // Add HTTP metrics middleware
  app.addHook('onRequest', httpMetrics.middleware('company-kernel'));

  // Business metrics for missions
  const missionsQueuedTotal = createCounter({
    name: 'simcorp_missions_queued_total',
    help: 'Total number of missions queued',
    labelNames: ['agent_id'],
    registry: metricsRegistry,
  });

  const missionsCompletedTotal = createCounter({
    name: 'simcorp_missions_completed_total',
    help: 'Total number of missions completed',
    labelNames: ['agent_id', 'status'],
    registry: metricsRegistry,
  });

  const missionsActiveGauge = createGauge({
    name: 'simcorp_missions_active',
    help: 'Number of currently active missions',
    labelNames: ['agent_id'],
    registry: metricsRegistry,
  });

  // Expose metrics to mission store for instrumentation
  app.decorate('metrics', {
    missionsQueuedTotal,
    missionsCompletedTotal,
    missionsActiveGauge,
    registry: metricsRegistry,
  });

  const registry = new Registry();
  const policy = new PolicyEngine(registry);
  const traces = new TraceStore();
  const db = openKernelDatabase(options.dbPath ?? process.env.KERNEL_DB_PATH, app.log);
  const missionRepo = new MissionRepository(db);
  const missions = options.missionStore ?? new MissionStore(missionRepo);
  const governorConfig = new GovernorConfigStore(db);
  const rateLimiter = new RateLimiter(db);
  const governor = new GovernorEngine(governorConfig, rateLimiter);

  await registerHealthRoutes(app);
  await registerAgentRoutes(app, { registry });
  await registerToolRoutes(app, { registry });
  await registerPolicyRoutes(app, { policy });
  await registerTraceRoutes(app, { traces });
  await registerMissionRoutes(app, { missions, governor });
  await registerGovernorRoutes(app, { config: governorConfig });

  // Prometheus metrics endpoint
  app.get('/metrics', async (_, reply) => {
    const metrics = await metricsHandler(metricsRegistry);
    reply.header('Content-Type', 'text/plain; version=0.0.4');
    return metrics;
  });

  return app;
}
