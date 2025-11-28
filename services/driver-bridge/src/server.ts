import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { DriverBridge } from "./core/bridge";
import { loadDriver } from "./core/drivers";
import { RealMqttPublisher } from "./mqtt/publisher";
import { registerHealthRoutes } from "./routes/health";
import { registerStartRoute } from "./routes/start";
import { registerStopRoute } from "./routes/stop";
import { registerStatusRoute } from "./routes/status";

interface BuildServerOptions {
  logger?: FastifyServerOptions["logger"];
  driverFactory?: ReturnType<typeof loadDriver>;
  mqttPublisher?: RealMqttPublisher;
  bridge?: DriverBridge;
}

export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true });

  const mqttPublisher = options.mqttPublisher ?? new RealMqttPublisher();
  const bridge =
    options.bridge ??
    new DriverBridge({
      driverFactory: options.driverFactory ?? loadDriver("fake"),
      mqttPublisher
    });

  registerHealthRoutes(app);
  registerStartRoute(app, { bridge, loadDriverFn: options.driverFactory ? () => options.driverFactory! : loadDriver });
  registerStopRoute(app, { bridge });
  registerStatusRoute(app, { bridge });

  app.addHook("onClose", async () => {
    if (mqttPublisher?.disconnect) {
      await mqttPublisher.disconnect().catch((error: unknown) => {
        app.log.error(error, "driver-bridge: failed to disconnect MQTT publisher");
      });
    }
    const sessions = bridge.list();
    await Promise.all(
      sessions.map(async (session) => {
        try {
          await session.stop();
        } catch (err) {
          app.log.error(err, "driver-bridge: failed stopping session");
        }
      })
    );
  });

  return app;
}
