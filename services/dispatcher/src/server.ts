import Fastify, { type FastifyInstance } from "fastify";
import { Dispatcher } from "./core/dispatcher";
import { KernelClient } from "./core/kernel-client";
import { DispatcherMqttClient, type MqttSubscriber } from "./mqtt/client";
import { resolveTopics } from "./mqtt/topics";
import { registerHealthRoutes } from "./routes/health";
import { registerStatusRoutes } from "./routes/status";
import { registerConfigRoutes } from "./routes/config";
import { registerReplayRoutes } from "./routes/replay";
import { initializeMetrics, metricsHandler, Registry as PrometheusRegistry } from "@sim-corp/metrics";
import { setupHealthAndShutdown, createMqttChecker } from "@sim-corp/health";

interface BuildServerOptions {
  mqttClient?: MqttSubscriber | null;
  dispatcher?: Dispatcher;
  enableGracefulShutdown?: boolean;
}

export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  // Initialize Prometheus metrics
  const metricsRegistry = new PrometheusRegistry();
  const httpMetrics = initializeMetrics({
    serviceName: 'dispatcher',
    collectDefaultMetrics: true,
    prefix: 'simcorp',
    registry: metricsRegistry,
  });

  // Add HTTP metrics middleware
  app.addHook('onRequest', httpMetrics.middleware('dispatcher'));
  const topics = resolveTopics(process.env.DISPATCHER_TOPICS);
  const goals = resolveGoals(process.env.DISPATCHER_GOALS);
  const maxAttempts = resolveMaxAttempts(process.env.DISPATCHER_MAX_ATTEMPTS);
  const kernelUrl = process.env.KERNEL_URL ?? "http://127.0.0.1:3000";

  const dispatcher =
    options.dispatcher ??
    new Dispatcher({
      kernel: new KernelClient(kernelUrl),
      logger: app.log,
      goals,
      subscribedTopics: topics,
      maxAttempts
    });

  const mqttClient = resolveMqttClient(options.mqttClient, topics, app);
  if (mqttClient) {
    await mqttClient.subscribe(topics, (topic, payload) => dispatcher.handleMessage(topic, payload));
    app.addHook("onClose", async () => {
      await mqttClient.disconnect().catch((err: unknown) => {
        app.log.error(err, "dispatcher: mqtt disconnect failed");
      });
    });
  } else {
    app.log.warn("dispatcher starting without MQTT subscription");
  }

  // Setup health checks and graceful shutdown
  const dependencies: Record<string, () => Promise<{ status: 'healthy' | 'unhealthy'; message?: string; latency?: number }>> = {};
  if (mqttClient) {
    dependencies.mqtt = createMqttChecker(mqttClient);
  }
  setupHealthAndShutdown(app, {
    serviceName: 'dispatcher',
    dependencies,
    includeSystemMetrics: true,
  }, options.enableGracefulShutdown !== false ? {
    timeout: 10000,
    logger: app.log,
  } : undefined);

  await registerStatusRoutes(app, dispatcher);
  await registerConfigRoutes(app, {
    topics,
    goals,
    mqttUrl: mqttClient?.getUrl() ?? process.env.DISPATCHER_MQTT_URL ?? "mqtt://127.0.0.1:1883",
    kernelUrl,
    maxAttempts
  });
  if (shouldEnableReplay()) {
    await registerReplayRoutes(app, dispatcher);
  }

  // Prometheus metrics endpoint
  app.get('/metrics', async (_, reply) => {
    const metrics = await metricsHandler(metricsRegistry);
    reply.header('Content-Type', 'text/plain; version=0.0.4');
    return metrics;
  });

  return app;
}

function resolveGoals(raw?: string | null): string[] {
  if (!raw || raw.trim() === "") return ["generate-roast-report"];
  return raw
    .split(",")
    .map((goal) => goal.trim())
    .filter(Boolean);
}

function resolveMaxAttempts(raw?: string | null): number {
  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return 5;
}

function resolveMqttClient(
  provided: MqttSubscriber | null | undefined,
  topics: string[],
  app: FastifyInstance
): MqttSubscriber | null {
  if (provided === null) {
    return null;
  }
  if (provided) return provided;

  const brokerUrl = process.env.DISPATCHER_MQTT_URL ?? "mqtt://127.0.0.1:1883";
  try {
    return new DispatcherMqttClient(brokerUrl, process.env.DISPATCHER_MQTT_CLIENT_ID);
  } catch (err) {
    app.log.error({ err, topics }, "dispatcher: failed to connect to MQTT broker");
    return null;
  }
}

function shouldEnableReplay(): boolean {
  const flag = process.env.DISPATCHER_REPLAY_ENABLED ?? "false";
  return flag.toLowerCase() === "true";
}
