import { buildServer } from "./server";

async function main(): Promise<void> {
  const app = await buildServer();
  const port = Number(process.env.DISPATCHER_PORT ?? process.env.PORT ?? 4010);
  const host = process.env.DISPATCHER_HOST ?? "0.0.0.0";
  await app.listen({ host, port });
  app.log.info(`dispatcher listening on ${host}:${port}`);
}

void main();
