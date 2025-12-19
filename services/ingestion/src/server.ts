import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { TelemetryStore, EventStore } from "./core/store";
import { IngestionHandlers } from "./core/handlers";
import { attachMqttHandlers } from "./core/router";
import { RealMqttClient, type MqttClient } from "./mqtt-client";
import { registerHealthRoutes } from "./routes/health";
import { registerTelemetryRoutes } from "./routes/telemetry";
import { registerEventRoutes } from "./routes/events";
import { registerStreamRoutes } from "./routes/stream";
import { openDatabase } from "./db/connection";
import { IngestionRepository } from "./db/repo";
import { Sessionizer } from "./core/sessionizer";
import { PersistencePipeline } from "./core/persist";
import { registerSessionRoutes } from "./routes/sessions";
import { EnvelopeStream } from "./core/envelope-stream";
import { registerEnvelopeStreamRoutes } from "./routes/stream-envelopes";
import { registerSessionQcRoutes } from "./routes/sessions-qc";
import { registerSessionReportRoutes } from "./routes/session-reports";
import { ReportMissionEnqueuer } from "./core/report-missions";
import { MqttOpsEventPublisher, type OpsEventPublisher } from "./ops/publisher";
import { registerProfileRoutes } from "./routes/profiles";
import { registerAuth } from "./auth";
import { DeviceKeyResolver, EnvelopeVerifier, parseFallbackKeys } from "./core/verification";

interface BuildServerOptions {
  logger?: FastifyServerOptions["logger"];
  telemetryStore?: TelemetryStore;
  eventStore?: EventStore;
  mqttClient?: MqttClient | null;
  opsPublisher?: OpsEventPublisher | null;
}

export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true });

  const telemetryStore = options.telemetryStore ?? new TelemetryStore();
  const eventStore = options.eventStore ?? new EventStore();
  const db = openDatabase();
  const repo = new IngestionRepository(db);
  const sessionizer = new Sessionizer();
  const opsPublisher = resolveOpsPublisher(options.opsPublisher, app);
  const reportMissionEnqueuer = new ReportMissionEnqueuer({
    repo,
    logger: app.log,
    kernelUrl: process.env.INGESTION_KERNEL_URL,
    opsPublisher
  });
  const persist = new PersistencePipeline({
    repo,
    sessionizer,
    onSessionClosed: (session) => reportMissionEnqueuer.handleSessionClosed(session)
  });
  const envelopeStream = new EnvelopeStream();
  const handlers = new IngestionHandlers(telemetryStore, eventStore, persist, envelopeStream);
  const verifier = buildVerifier(app);

  const mqttClient = resolveMqttClient(options.mqttClient, app);
  if (mqttClient) {
    attachMqttHandlers(mqttClient, handlers, { logger: app.log, verifier });
    app.addHook("onClose", async () => {
      await mqttClient.disconnect().catch((error: unknown) => {
        app.log.error(error, "Failed to disconnect MQTT client");
      });
    });
  } else {
    app.log.warn("INGESTION_MQTT_URL not set; running without MQTT ingestion");
  }

  if (opsPublisher) {
    app.addHook("onClose", async () => {
      await opsPublisher.disconnect().catch((error: unknown) => {
        app.log.error(error, "Failed to disconnect ops MQTT publisher");
      });
    });
  }

  const tickInterval = setInterval(() => {
    persist.tick(new Date().toISOString());
  }, 1000);
  app.addHook("onClose", async () => {
    clearInterval(tickInterval);
  });

  registerHealthRoutes(app);
  registerAuth(app);
  registerTelemetryRoutes(app, { telemetryStore });
  registerEventRoutes(app, { eventStore });
  registerStreamRoutes(app, { telemetryStore, eventStore });
  registerSessionRoutes(app, { repo });
  registerSessionQcRoutes(app, { repo });
  registerSessionReportRoutes(app, { repo });
  registerProfileRoutes(app, { repo });
  registerEnvelopeStreamRoutes(app, { envelopeStream });

  return app;
}

function buildVerifier(app: FastifyInstance): EnvelopeVerifier {
  const kernelUrl = process.env.INGESTION_KERNEL_URL ?? process.env.KERNEL_URL;
  const fallback = parseFallbackKeys(process.env.INGESTION_DEVICE_KEYS_JSON);
  const resolver = new DeviceKeyResolver({ kernelUrl, fallbackKeys: fallback, logger: app.log });
  return new EnvelopeVerifier(resolver);
}

function resolveMqttClient(providedClient: MqttClient | null | undefined, app: FastifyInstance): MqttClient | null {
  if (providedClient === null) {
    return null;
  }
  if (providedClient) {
    return providedClient;
  }

  const brokerUrl = process.env.INGESTION_MQTT_URL;
  if (!brokerUrl) {
    return null;
  }

  const clientId = process.env.INGESTION_MQTT_CLIENT_ID;
  try {
    return new RealMqttClient(brokerUrl, clientId);
  } catch (error) {
    app.log.error(error, "Failed to initialize MQTT client");
    return null;
  }
}

function resolveOpsPublisher(provided: OpsEventPublisher | null | undefined, app: FastifyInstance): OpsEventPublisher | null {
  const flag = process.env.INGESTION_OPS_EVENTS_ENABLED ?? "false";
  if (flag.toLowerCase() !== "true") {
    return null;
  }
  if (provided === null) {
    return null;
  }
  if (provided) {
    return provided;
  }

  const brokerUrl = process.env.INGESTION_OPS_MQTT_URL ?? process.env.INGESTION_MQTT_URL;
  if (!brokerUrl) {
    app.log.warn("INGESTION_OPS_EVENTS_ENABLED is true but INGESTION_OPS_MQTT_URL is not set");
    return null;
  }

  try {
    return new MqttOpsEventPublisher(brokerUrl, process.env.INGESTION_OPS_MQTT_CLIENT_ID);
  } catch (error) {
    app.log.error(error, "Failed to initialize ops MQTT publisher");
    return null;
  }
}
