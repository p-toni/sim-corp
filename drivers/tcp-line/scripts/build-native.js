import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const nativeDir = path.resolve(__dirname, "../native");
const manifestPath = path.join(nativeDir, "Cargo.toml");

const build = spawnSync("cargo", ["build", "--release", "--manifest-path", manifestPath], {
  stdio: "inherit"
});

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const targetDir = path.join(nativeDir, "target", "release");
const libName = process.platform === "win32"
  ? "tcp_line_native.dll"
  : process.platform === "darwin"
    ? "libtcp_line_native.dylib"
    : "libtcp_line_native.so";

const builtPath = path.join(targetDir, libName);
if (!existsSync(builtPath)) {
  throw new Error(`native binary not found at ${builtPath}`);
}

const outputPath = path.join(nativeDir, "index.node");
mkdirSync(path.dirname(outputPath), { recursive: true });
copyFileSync(builtPath, outputPath);
