import Fastify, type { FastifyInstance } from "fastify";
import { openDatabase } from "./db/connection";
import { EvalRepository } from "./db/repo";
import { EvalService } from "./core/eval-service";
import { registerGoldenCaseRoutes } from "./routes/golden-cases";
import { registerEvaluationRoutes } from "./routes/evaluations";

export interface BuildServerOptions {
  logger?: boolean;
  dbPath?: string;
}

export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true });

  // Initialize database and repository
  const db = openDatabase(options.dbPath);
  const repo = new EvalRepository(db);
  const evalService = new EvalService(repo);

  // Health check
  app.get("/health", () => ({ status: "ok", service: "eval" }));

  // Register routes
  registerGoldenCaseRoutes(app, { evalService });
  registerEvaluationRoutes(app, { evalService });

  // Cleanup on shutdown
  app.addHook("onClose", async () => {
    db.close();
  });

  return app;
}

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = parseInt(process.env.PORT ?? "4007", 10);
  const host = process.env.HOST ?? "127.0.0.1";

  buildServer()
    .then((app) => {
      app.listen({ port, host }, (err) => {
        if (err) {
          app.log.error(err);
          process.exit(1);
        }
      });
    })
    .catch((err) => {
      console.error("Failed to start server:", err);
      process.exit(1);
    });
}
