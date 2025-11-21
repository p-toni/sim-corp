import { buildServer } from "./server";

async function main(): Promise<void> {
  try {
    const port = Number(process.env.KERNEL_PORT ?? process.env.PORT ?? 3000);
    const host = process.env.KERNEL_HOST ?? "0.0.0.0";
    const server = await buildServer();

    await server.listen({ port, host });
    server.log.info(`company-kernel listening on ${host}:${port}`);
  } catch (error) {
    // eslint-disable-next-line no-console -- startup errors must surface in logs
    console.error("Failed to start company-kernel server", error);
    process.exitCode = 1;
  }
}

void main();
