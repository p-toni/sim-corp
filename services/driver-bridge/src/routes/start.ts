import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { DriverBridge } from "../core/bridge";
import { loadDriver } from "../core/drivers";
import { RealMqttPublisher } from "../mqtt/publisher";
import type { DriverConfig } from "@sim-corp/driver-core";

const DriverConfigSchema = z.object({
  orgId: z.string(),
  siteId: z.string(),
  machineId: z.string(),
  connection: z.record(z.string(), z.unknown())
});

const StartBodySchema = z.object({
  driverName: z.string().optional(),
  config: DriverConfigSchema.extend({
    connection: z.record(z.string(), z.unknown()).default({})
  })
});

interface StartDeps {
  bridge: DriverBridge;
  loadDriverFn?: (name: string) => ReturnType<typeof loadDriver>;
}

export function registerStartRoute(app: FastifyInstance, deps: StartDeps): void {
  const { bridge, loadDriverFn = loadDriver } = deps;

  app.post(
    "/bridge/start",
    async (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
      const parsed = StartBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid start request", issues: parsed.error.issues });
      }

      const driverName = parsed.data.driverName ?? process.env.DRIVER_KIND ?? "fake";
      const config = parsed.data.config as DriverConfig;
      config.connection = mergeConnection(driverName, config.connection);

      const driverFactory = loadDriverFn(driverName);
      const session = await bridge.start(config, driverFactory);

      return { sessionId: session.id, stats: session.stats };
    }
  );
}

function mergeConnection(driverName: string, provided: Record<string, unknown>): Record<string, unknown> {
  if (driverName.toLowerCase() !== "tcp-line") return provided;
  let envConfig: Record<string, unknown> = {};
  if (process.env.DRIVER_TCP_LINE_CONFIG_JSON) {
    try {
      envConfig = JSON.parse(process.env.DRIVER_TCP_LINE_CONFIG_JSON);
    } catch {
      envConfig = {};
    }
  }
  const merged = { ...envConfig, ...provided };
  const emitIntervalMs =
    typeof merged.emitIntervalMs === "number" ? merged.emitIntervalMs : 1000;
  if (typeof merged.sampleIntervalSeconds !== "number") {
    merged.sampleIntervalSeconds = emitIntervalMs / 1000;
  }
  merged.emitIntervalMs = emitIntervalMs;
  return merged;
}
