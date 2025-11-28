import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { SimPublisherManager } from "./core/publish";
import { HttpSimTwinClient } from "./core/sim-twin";
import { RealMqttPublisher } from "./core/mqtt";
import type { MqttPublisher, SimTwinClient } from "./core/types";
import { registerHealthRoutes } from "./routes/health";
import { registerStartRoute } from "./routes/start";
import { registerStopRoute } from "./routes/stop";
import { registerStatusRoute } from "./routes/status";

interface BuildServerOptions {
  logger?: FastifyServerOptions["logger"];
  manager?: SimPublisherManager;
  mqttPublisher?: MqttPublisher;
  simTwinClient?: SimTwinClient;
}

export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true });

  const mqttPublisher = options.mqttPublisher ?? new RealMqttPublisher();
  const simTwinClient = options.simTwinClient ?? new HttpSimTwinClient();
  const manager = options.manager ?? new SimPublisherManager(mqttPublisher, simTwinClient);

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

  return app;
}
