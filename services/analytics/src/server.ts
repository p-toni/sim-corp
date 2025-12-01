import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { registerHealthRoute } from "./routes/health";
import { registerAnalyzeRoute } from "./routes/analyze-session";
import { registerPredictionRoute } from "./routes/prediction-session";

interface BuildOptions {
  logger?: FastifyServerOptions["logger"];
}

export async function buildServer(options: BuildOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true });

  registerHealthRoute(app);
  registerAnalyzeRoute(app);
  registerPredictionRoute(app);

  return app;
}
