import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const zodPath = require.resolve("zod");

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      zod: zodPath
    }
  },
  test: {
    environment: "node",
    globals: true,
    include: ["**/*.test.ts"],
    coverage: {
      reporter: ["text", "lcov"],
      include: ["libs/**/*"]
    }
  }
});
