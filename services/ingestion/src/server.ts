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

interface BuildServerOptions {
  logger?: FastifyServerOptions["logger"];
  telemetryStore?: TelemetryStore;
  eventStore?: EventStore;
  mqttClient?: MqttClient | null;
}

export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true });

  const telemetryStore = options.telemetryStore ?? new TelemetryStore();
  const eventStore = options.eventStore ?? new EventStore();
  const db = openDatabase();
  const repo = new IngestionRepository(db);
  const sessionizer = new Sessionizer();
  const reportMissionEnqueuer = new ReportMissionEnqueuer({
    repo,
    logger: app.log,
    kernelUrl: process.env.INGESTION_KERNEL_URL
  });
  const persist = new PersistencePipeline({
    repo,
    sessionizer,
    onSessionClosed: (session) => reportMissionEnqueuer.handleSessionClosed(session)
  });
  const envelopeStream = new EnvelopeStream();
  const handlers = new IngestionHandlers(telemetryStore, eventStore, persist, envelopeStream);

  const mqttClient = resolveMqttClient(options.mqttClient, app);
  if (mqttClient) {
    attachMqttHandlers(mqttClient, handlers, { logger: app.log });
    app.addHook("onClose", async () => {
      await mqttClient.disconnect().catch((error: unknown) => {
        app.log.error(error, "Failed to disconnect MQTT client");
      });
    });
  } else {
    app.log.warn("INGESTION_MQTT_URL not set; running without MQTT ingestion");
  }

  const tickInterval = setInterval(() => {
    persist.tick(new Date().toISOString());
  }, 1000);
  app.addHook("onClose", async () => {
    clearInterval(tickInterval);
  });

  registerHealthRoutes(app);
  registerTelemetryRoutes(app, { telemetryStore });
  registerEventRoutes(app, { eventStore });
  registerStreamRoutes(app, { telemetryStore, eventStore });
  registerSessionRoutes(app, { repo });
  registerSessionQcRoutes(app, { repo });
  registerSessionReportRoutes(app, { repo });
  registerEnvelopeStreamRoutes(app, { envelopeStream });

  return app;
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
