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

interface BuildServerOptions {
  missionStore?: MissionStore;
}

export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  const registry = new Registry();
  const policy = new PolicyEngine(registry);
  const traces = new TraceStore();
  const missions = options.missionStore ?? new MissionStore();

  await registerHealthRoutes(app);
  await registerAgentRoutes(app, { registry });
  await registerToolRoutes(app, { registry });
  await registerPolicyRoutes(app, { policy });
  await registerTraceRoutes(app, { traces });
  await registerMissionRoutes(app, { missions });

  return app;
}
