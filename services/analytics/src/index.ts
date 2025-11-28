import { fileURLToPath } from "node:url";
import { buildServer } from "./server";

async function main(): Promise<void> {
  try {
    const port = Number(process.env.ANALYTICS_PORT ?? process.env.PORT ?? 4006);
    const host = process.env.ANALYTICS_HOST ?? "0.0.0.0";
    const server = await buildServer();
    await server.listen({ port, host });
    server.log.info(`analytics listening on ${host}:${String(port)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`analytics failed to start: ${message}\n`);
    process.exit(1);
  }
}

const entryFile = process.argv[1];
const isCliEntry = entryFile && fileURLToPath(import.meta.url) === entryFile;

if (isCliEntry) {
  void main();
}
