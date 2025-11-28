import type { FastifyInstance } from "fastify";
import type { Dispatcher } from "../core/dispatcher";

export async function registerStatusRoutes(app: FastifyInstance, dispatcher: Dispatcher): Promise<void> {
  app.get("/status", async () => dispatcher.getStatus());
}
