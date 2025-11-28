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
  driverName: z.string(),
  config: DriverConfigSchema
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

      const { driverName, config } = parsed.data;
      const driverFactory = loadDriverFn(driverName);
      const session = await bridge.start(config as DriverConfig, driverFactory);

      return { sessionId: session.id, stats: session.stats };
    }
  );
}
