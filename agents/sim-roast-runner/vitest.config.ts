import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..", "..");
const resolveWorkspacePath = (relativePath: string) =>
  path.resolve(workspaceRoot, relativePath);

export default defineConfig({
  test: {
    environment: "node"
  },
  resolve: {
    alias: {
      "@sim-corp/agent-runtime": resolveWorkspacePath("libs/agent-runtime/src/index.ts"),
      "@sim-corp/schemas": resolveWorkspacePath("libs/schemas/src/index.ts"),
      "@sim-corp/sim-twin": resolveWorkspacePath("services/sim-twin/src/index.ts")
    }
  }
});
