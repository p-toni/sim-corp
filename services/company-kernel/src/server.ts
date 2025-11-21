import Fastify, { type FastifyInstance } from "fastify";
import { registerHealthRoutes } from "./routes/health";
import { registerAgentRoutes } from "./routes/agents";
import { registerToolRoutes } from "./routes/tools";
import { registerPolicyRoutes } from "./routes/policy";
import { registerTraceRoutes } from "./routes/traces";
import { Registry } from "./core/registry";
import { PolicyEngine } from "./core/policy";
import { TraceStore } from "./core/traces";

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  const registry = new Registry();
  const policy = new PolicyEngine(registry);
  const traces = new TraceStore();

  await registerHealthRoutes(app);
  await registerAgentRoutes(app, { registry });
  await registerToolRoutes(app, { registry });
  await registerPolicyRoutes(app, { policy });
  await registerTraceRoutes(app, { traces });

  return app;
}
