import Fastify from "fastify";
import { KernelClient } from "./core/kernel-client";
import { RoastReportRunner } from "./core/runner";
import { ReportWorker } from "./core/worker";
import { registerHealthRoutes } from "./routes/health";
import { registerStatusRoutes } from "./routes/status";
import { IngestionClient } from "./core/ingestion-client";

async function main(): Promise<void> {
  const app = Fastify({ logger: true });
  const kernelClient = new KernelClient();
  const ingestionClient = new IngestionClient();
  const runner = new RoastReportRunner({
    ingestionUrl: process.env.INGESTION_URL,
    analyticsUrl: process.env.ANALYTICS_URL
  });
  const worker = new ReportWorker({ runner, kernelClient, ingestionClient });
  worker.start();

  await registerHealthRoutes(app);
  await registerStatusRoutes(app, worker);

  const port = Number(process.env.REPORT_WORKER_PORT ?? process.env.PORT ?? 4007);
  const host = process.env.REPORT_WORKER_HOST ?? "0.0.0.0";
  await app.listen({ port, host });
  app.log.info(`report-worker listening on ${host}:${port}`);
}

void main();
