import Fastify from "fastify";
import type { Driver } from "@sim-corp/driver-core";
import { openDatabase } from "./db/connection.js";
import { createCommandService } from "./core/command-service.js";
import { createCommandExecutor } from "./core/executor.js";
import { createCommandAnalytics } from "./core/analytics.js";
import { proposalsRoutes } from "./routes/proposals.js";
import { executionRoutes } from "./routes/execution.js";
import { analyticsRoutes } from "./routes/analytics.js";

const PORT = parseInt(process.env.COMMAND_PORT ?? "3004", 10);
const HOST = process.env.COMMAND_HOST ?? "0.0.0.0";

// Driver registry (placeholder - in production this would connect to actual drivers)
const driverRegistry = new Map<string, Driver>();

async function getDriver(machineId: string): Promise<Driver> {
  const driver = driverRegistry.get(machineId);
  if (!driver) {
    throw new Error(`No driver registered for machine ${machineId}`);
  }
  return driver;
}

// Register a driver for a machine (would be called during driver initialization)
export function registerDriver(machineId: string, driver: Driver): void {
  driverRegistry.set(machineId, driver);
}

async function main() {
  const db = openDatabase();
  const commandService = createCommandService({ db });
  const executor = createCommandExecutor({ db, getDriver });
  const analytics = createCommandAnalytics(db);

  const fastify = Fastify({
    logger: true,
  });

  // Health check
  fastify.get("/health", async () => {
    return { status: "ok", service: "command" };
  });

  // Register routes
  await fastify.register(proposalsRoutes, { commandService });
  await fastify.register(executionRoutes, { executor });
  await fastify.register(analyticsRoutes, { analytics });

  // Start server
  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`Command service listening on ${HOST}:${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("Failed to start command service:", err);
    process.exit(1);
  });
}

export { createCommandService, createCommandExecutor, registerDriver };
