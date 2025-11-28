import type { FastifyInstance } from "fastify";
import type { ReportWorker } from "../core/worker";

export async function registerStatusRoutes(app: FastifyInstance, worker: ReportWorker): Promise<void> {
  app.get("/status", async () => worker.getStatus());
}
