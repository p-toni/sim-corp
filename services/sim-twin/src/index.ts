import { fileURLToPath } from "node:url";
import { buildServer } from "./server";

export { buildServer } from "./server";
export { simulateRoast, type SimRoastResult } from "./core/model";
export { SimRoastRequestSchema, type SimRoastRequest } from "./core/types";

async function main(): Promise<void> {
  try {
    const port = Number(process.env.SIM_TWIN_HTTP_PORT ?? process.env.PORT ?? 4002);
    const host = process.env.SIM_TWIN_HTTP_HOST ?? "0.0.0.0";
    const server = await buildServer();

    await server.listen({ port, host });
    server.log.info(`sim-twin listening on ${host}:${port}`);
  } catch (error) {
    // eslint-disable-next-line no-console -- startup errors must surface in logs
    console.error("Failed to start sim-twin server", error);
    process.exitCode = 1;
  }
}

const entryFile = process.argv[1];
const isCliEntry = entryFile && fileURLToPath(import.meta.url) === entryFile;

if (isCliEntry) {
  void main();
}
