import type { FastifyInstance } from "fastify";

interface ConfigPayload {
  topics: string[];
  goals: string[];
  mqttUrl: string;
  kernelUrl: string;
  maxAttempts: number;
}

export async function registerConfigRoutes(app: FastifyInstance, config: ConfigPayload): Promise<void> {
  app.get("/config", async () => config);
}
