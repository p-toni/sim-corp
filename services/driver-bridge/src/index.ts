import { fileURLToPath } from "node:url";
import { buildServer } from "./server";

async function main(): Promise<void> {
  try {
    const port = Number(process.env.DRIVER_BRIDGE_PORT ?? process.env.PORT ?? 4004);
    const host = process.env.DRIVER_BRIDGE_HOST ?? "0.0.0.0";
    const server = await buildServer();
    await server.listen({ port, host });
    server.log.info(`driver-bridge listening on ${host}:${String(port)}`);
  } catch (error) {
    const message = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
    process.stderr.write(`driver-bridge failed to start: ${message}\n`);
    process.exit(1);
  }
}

const entryFile = process.argv[1];
const isCliEntry = entryFile && fileURLToPath(import.meta.url) === entryFile;

if (isCliEntry) {
  void main();
}
