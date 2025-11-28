import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node"
  },
  ssr: {
    external: ["better-sqlite3"]
  }
});
