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

interface BuildServerOptions {
  missionStore?: MissionStore;
  dbPath?: string;
}

export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  registerAuth(app);

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

  return app;
}
