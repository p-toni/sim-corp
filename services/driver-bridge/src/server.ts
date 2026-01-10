import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { DriverBridge } from "./core/bridge";
import { loadDriver } from "./core/drivers";
import { RealMqttPublisher } from "./mqtt/publisher";
import { registerHealthRoutes } from "./routes/health";
import { registerStartRoute } from "./routes/start";
import { registerStopRoute } from "./routes/stop";
import { registerStatusRoute } from "./routes/status";
import { initializeMetrics, metricsHandler, Registry as PrometheusRegistry } from "@sim-corp/metrics";
import { setupHealthAndShutdown, createMqttChecker } from "@sim-corp/health";

interface BuildServerOptions {
  logger?: FastifyServerOptions["logger"];
  driverFactory?: ReturnType<typeof loadDriver>;
  mqttPublisher?: RealMqttPublisher;
  bridge?: DriverBridge;
  enableGracefulShutdown?: boolean;
}

export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true });
  // Initialize Prometheus metrics
  const metricsRegistry = new PrometheusRegistry();
  const httpMetrics = initializeMetrics({
    serviceName: 'driver-bridge',
    collectDefaultMetrics: true,
    prefix: 'simcorp',
    registry: metricsRegistry,
  });

  // Add HTTP metrics middleware
  app.addHook('onRequest', httpMetrics.middleware('driver-bridge'));

  const mqttPublisher = options.mqttPublisher ?? new RealMqttPublisher();
  const driverKind = process.env.DRIVER_KIND ?? "fake";
  const bridge =
    options.bridge ??
    new DriverBridge({
      driverFactory: options.driverFactory ?? loadDriver(driverKind),
      mqttPublisher
    });

  // Setup health checks and graceful shutdown
  const dependencies: Record<string, () => Promise<{ status: 'healthy' | 'unhealthy'; message?: string; latency?: number }>> = {};
  if (mqttClient) {
    dependencies.mqtt = createMqttChecker(mqttClient);
  }
  setupHealthAndShutdown(app, {
    serviceName: 'driver-bridge',
    dependencies,
    includeSystemMetrics: true,
  }, options.enableGracefulShutdown !== false ? {
    timeout: 10000,
    logger: app.log,
  } : undefined);

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

  // Prometheus metrics endpoint
  app.get('/metrics', async (_, reply) => {
    const metrics = await metricsHandler(metricsRegistry);
    reply.header('Content-Type', 'text/plain; version=0.0.4');
    return metrics;
  });

  return app;
}
