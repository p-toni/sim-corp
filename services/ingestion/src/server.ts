import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { TelemetryStore, EventStore } from "./core/store";
import { IngestionHandlers } from "./core/handlers";
import { attachMqttHandlers } from "./core/router";
import { RealMqttClient, type MqttClient } from "./mqtt-client";
import { registerHealthRoutes } from "./routes/health";
import { registerTelemetryRoutes } from "./routes/telemetry";
import { registerEventRoutes } from "./routes/events";

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
  const handlers = new IngestionHandlers(telemetryStore, eventStore);

  const mqttClient = resolveMqttClient(options.mqttClient, app);
  if (mqttClient) {
    attachMqttHandlers(mqttClient, handlers, { logger: app.log });
    app.addHook("onClose", async () => {
      await mqttClient.disconnect().catch((error) => {
        app.log.error(error, "Failed to disconnect MQTT client");
      });
    });
  } else {
    app.log.warn("INGESTION_MQTT_URL not set; running without MQTT ingestion");
  }

  await registerHealthRoutes(app);
  await registerTelemetryRoutes(app, { telemetryStore });
  await registerEventRoutes(app, { eventStore });

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
