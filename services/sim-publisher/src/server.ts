import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { SimPublisherManager } from "./core/publish";
import { HttpSimTwinClient } from "./core/sim-twin";
import { RealMqttPublisher } from "./core/mqtt";
import type { MqttPublisher, SimTwinClient } from "./core/types";
import { registerHealthRoutes } from "./routes/health";
import { registerStartRoute } from "./routes/start";
import { registerStopRoute } from "./routes/stop";
import { registerStatusRoute } from "./routes/status";
import { initializeMetrics, metricsHandler, Registry as PrometheusRegistry } from "@sim-corp/metrics";

interface BuildServerOptions {
  logger?: FastifyServerOptions["logger"];
  manager?: SimPublisherManager;
  mqttPublisher?: MqttPublisher;
  simTwinClient?: SimTwinClient;
  keystorePath?: string;
}

export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true });
  // Initialize Prometheus metrics
  const metricsRegistry = new PrometheusRegistry();
  const httpMetrics = initializeMetrics({
    serviceName: 'sim-publisher',
    collectDefaultMetrics: true,
    prefix: 'simcorp',
    registry: metricsRegistry,
  });

  // Add HTTP metrics middleware
  app.addHook('onRequest', httpMetrics.middleware('sim-publisher'));

  const mqttPublisher = options.mqttPublisher ?? new RealMqttPublisher();
  const simTwinClient = options.simTwinClient ?? new HttpSimTwinClient();
  const keystorePath = options.keystorePath ?? process.env.DEVICE_KEYSTORE_PATH ?? "./var/device-keys";
  const manager = options.manager ?? new SimPublisherManager(mqttPublisher, simTwinClient, keystorePath);

  registerHealthRoutes(app);
  registerStartRoute(app, { manager });
  registerStopRoute(app, { manager });
  registerStatusRoute(app, { manager });

  app.addHook("onClose", async () => {
    if (typeof (mqttPublisher as { disconnect?: () => Promise<void> }).disconnect === "function") {
      await (mqttPublisher as { disconnect: () => Promise<void> }).disconnect().catch((error: unknown) => {
        app.log.error(error, "sim-publisher: failed to disconnect MQTT publisher");
      });
    }
  });

  // Prometheus metrics endpoint
  app.get('/metrics', async (_, reply) => {
    const metrics = await metricsHandler(metricsRegistry);
    reply.header('Content-Type', 'text/plain; version=0.0.4');
    return metrics;
  });

  return app;
}
