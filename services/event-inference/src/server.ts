import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import type { Database } from "@sim-corp/database";
import { InferenceEngine } from "./core/engine";
import { RealMqttClient, type MqttClient } from "./mqtt/client";
import { attachSubscriber } from "./mqtt/subscriber";
import { registerStatusRoute } from "./routes/status";
import { registerConfigRoute } from "./routes/config";
import { getDatabase } from "./db/database";
import { ConfigRepository } from "./db/repo";
import {
  initializeMetrics,
  metricsHandler,
  Registry as PrometheusRegistry,
} from "@sim-corp/metrics";
import { setupHealthAndShutdown, createMqttChecker, createDatabaseChecker } from "@sim-corp/health";

interface BuildServerOptions {
  logger?: FastifyServerOptions["logger"];
  mqttClient?: MqttClient | null;
  enableGracefulShutdown?: boolean;
  /** Path to SQLite database (for testing) */
  dbPath?: string;
  /** Pre-created database instance (for testing) */
  db?: Database;
}

export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true });

  // Initialize Prometheus metrics
  const metricsRegistry = new PrometheusRegistry();
  const httpMetrics = initializeMetrics({
    serviceName: "event-inference",
    collectDefaultMetrics: true,
    prefix: "simcorp",
    registry: metricsRegistry,
  });

  // Add HTTP metrics middleware
  app.addHook("onRequest", httpMetrics.middleware("event-inference"));

  // Initialize database
  const db = options.db ?? (await getDatabase(options.dbPath, app.log));
  const configRepo = new ConfigRepository(db);

  // Initialize engine with persistent config storage
  const engine = new InferenceEngine({ configRepo });

  // Load persisted configs on startup
  const loadedCount = await engine.loadConfigs();
  app.log.info({ count: loadedCount }, "event-inference: loaded persisted configs");

  const mqttClient = resolveMqttClient(options.mqttClient, app);
  if (mqttClient) {
    await attachSubscriber(mqttClient, engine);
    app.addHook("onClose", async () => {
      await mqttClient
        .disconnect()
        .catch((err: unknown) => app.log.error(err, "event-inference: failed MQTT disconnect"));
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
        payload: event,
      };
      void mqttClient.publish(
        `roaster/${key.orgId}/${key.siteId}/${key.machineId}/events`,
        JSON.stringify(envelope)
      );
    });
  }, 1000);

  app.addHook("onClose", async () => {
    clearInterval(tickInterval);
    await db.close();
  });

  registerStatusRoute(app, { engine });
  registerConfigRoute(app, { engine });

  // Prometheus metrics endpoint
  app.get("/metrics", async (_, reply) => {
    const metrics = await metricsHandler(metricsRegistry);
    reply.header("Content-Type", "text/plain; version=0.0.4");
    return metrics;
  });

  // Setup health checks with database dependency
  if (options.enableGracefulShutdown !== false) {
    setupHealthAndShutdown(app, {
      serviceName: "event-inference",
      dependencies: [
        createDatabaseChecker(db, "event-inference-db"),
        ...(mqttClient ? [createMqttChecker(mqttClient as any, "mqtt")] : []),
      ],
    });
  } else {
    // Basic health route for testing (when graceful shutdown is disabled)
    app.get("/health", () => ({ status: "ok" }));
  }

  return app;
}

function resolveMqttClient(
  provided: MqttClient | null | undefined,
  app: FastifyInstance
): MqttClient | null {
  if (provided === null) return null;
  if (provided) return provided;

  const mqttUrl = process.env.MQTT_URL ?? null;

  if (!mqttUrl) {
    app.log.warn("event-inference: MQTT_URL not set");
    return null;
  }

  try {
    return new RealMqttClient(mqttUrl);
  } catch (err) {
    app.log.error(err, "event-inference: failed to init MQTT client");
    return null;
  }
}
