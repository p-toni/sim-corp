import { fileURLToPath } from "node:url";
import { buildServer } from "./server";

async function main(): Promise<void> {
  try {
    const port = Number(process.env.EVENT_INFERENCE_PORT ?? process.env.PORT ?? 4005);
    const host = process.env.EVENT_INFERENCE_HOST ?? "0.0.0.0";
    const server = await buildServer();
    await server.listen({ port, host });
    server.log.info(`event-inference listening on ${host}:${String(port)}`);
  } catch (error) {
    const message = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
    process.stderr.write(`event-inference failed to start: ${message}\n`);
    process.exit(1);
  }
}

const entryFile = process.argv[1];
const isCliEntry = entryFile && fileURLToPath(import.meta.url) === entryFile;

if (isCliEntry) {
  void main();
}
