import { fileURLToPath } from "node:url";
import { buildServer } from "./server";

async function main(): Promise<void> {
  try {
    const port = Number(process.env.SIM_PUBLISHER_PORT ?? process.env.PORT ?? 4003);
    const host = process.env.SIM_PUBLISHER_HOST ?? "0.0.0.0";
    const server = await buildServer();
    await server.listen({ port, host });
    server.log.info(`sim-publisher listening on ${host}:${String(port)}`);
  } catch (error) {
    const message = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
    process.stderr.write(`sim-publisher failed to start: ${message}\n`);
    process.exit(1);
  }
}

const entryFile = process.argv[1];
const isCliEntry = entryFile && fileURLToPath(import.meta.url) === entryFile;

if (isCliEntry) {
  void main();
}
