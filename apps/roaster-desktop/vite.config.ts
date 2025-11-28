import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const resolvePath = (p: string): string => path.resolve(__dirname, p);

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  resolve: {
    alias: {
      "@sim-corp/agent-runtime": resolvePath("../../libs/agent-runtime/src/index.ts"),
      "@sim-corp/sim-twin": resolvePath("../../services/sim-twin/src/index.ts"),
      "@sim-corp/schemas": resolvePath("../../libs/schemas/src/index.ts"),
      "@sim-corp/sim-roast-runner": resolvePath("../../agents/sim-roast-runner/src/index.ts"),
      "@sim-corp/sim-roast-runner/src": resolvePath("../../agents/sim-roast-runner/src"),
      "@sim-corp/sim-roast-runner/src/agent": resolvePath("../../agents/sim-roast-runner/src/agent.ts"),
      "node:crypto": resolvePath("src/shims/node-crypto.ts"),
      "node:perf_hooks": resolvePath("src/shims/perf-hooks.ts")
    }
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["./tests/setup.ts"],
    css: true
  }
});
