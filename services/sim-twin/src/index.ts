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
    const endpoint = `${host}:${String(port)}`;
    server.log.info(`sim-twin listening on ${endpoint}`);
  } catch (error) {
    const message = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
    process.stderr.write(`Failed to start sim-twin server: ${message}\n`);
    process.exitCode = 1;
  }
}

const entryFile = process.argv[1];
const isCliEntry = entryFile && fileURLToPath(import.meta.url) === entryFile;

if (isCliEntry) {
  void main();
}
