import { buildServer } from "./server";

const server = await buildServer();
try {
  await server.listen({ host: "0.0.0.0", port: 4001 });
} catch (err) {
  console.error(err);
  process.exit(1);
}
