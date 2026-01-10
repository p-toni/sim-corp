import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { InferenceEngine } from "./core/engine";
import { RealMqttClient, type MqttClient } from "./mqtt/client";
import { attachSubscriber } from "./mqtt/subscriber";
import { registerHealthRoute } from "./routes/health";
import { registerStatusRoute } from "./routes/status";
import { registerConfigRoute } from "./routes/config";
import { initializeMetrics, metricsHandler, Registry as PrometheusRegistry } from "@sim-corp/metrics";
import { setupHealthAndShutdown, createMqttChecker } from "@sim-corp/health";

interface BuildServerOptions {
  logger?: FastifyServerOptions["logger"];
  mqttClient?: MqttClient | null;
  enableGracefulShutdown?: boolean;
}

export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true });
  // Initialize Prometheus metrics
  const metricsRegistry = new PrometheusRegistry();
  const httpMetrics = initializeMetrics({
    serviceName: 'event-inference',
    collectDefaultMetrics: true,
    prefix: 'simcorp',
    registry: metricsRegistry,
  });

  // Add HTTP metrics middleware
  app.addHook('onRequest', httpMetrics.middleware('event-inference'));
  const engine = new InferenceEngine();

  const mqttClient = resolveMqttClient(options.mqttClient, app);
  if (mqttClient) {
    await attachSubscriber(mqttClient, engine);
    app.addHook("onClose", async () => {
      await mqttClient.disconnect().catch((err: unknown) => app.log.error(err, "event-inference: failed MQTT disconnect"));
    });
  } else {
    app.log.warn("event-inference: MQTT_URL not set, running HTTP-only");
  }

  const tickInterval = setInterval(() => {
    const nowIso = new Date().toISOString();
    if (!mqttClient) return;
    const drops = engine.tick(nowIso);
    drops.forEach(({ key, event }) => {
      const envelope = {
        ts: nowIso,
        origin: key,
        topic: "event" as const,
        payload: event
      };
      void mqttClient.publish(
        `roaster/${key.orgId}/${key.siteId}/${key.machineId}/events`,
        JSON.stringify(envelope)
      );
    });
  }, 1000);

  app.addHook("onClose", async () => {
    clearInterval(tickInterval);
  });

  registerHealthRoute(app);
  registerStatusRoute(app, { engine });
  registerConfigRoute(app, { engine });

  // Prometheus metrics endpoint
  app.get('/metrics', async (_, reply) => {
    const metrics = await metricsHandler(metricsRegistry);
    reply.header('Content-Type', 'text/plain; version=0.0.4');
    return metrics;
  });

  return app;
}

function resolveMqttClient(provided: MqttClient | null | undefined, app: FastifyInstance): MqttClient | null {
  if (provided === null) return null;
  if (provided) return provided;
  if (!process.env.MQTT_URL) return null;
  try {
    return new RealMqttClient();
  } catch (err) {
    app.log.error(err, "event-inference: failed to init MQTT client");
    return null;
  }
}
