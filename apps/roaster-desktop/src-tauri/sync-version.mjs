import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgPath = path.resolve(__dirname, "..", "package.json");
const tauriConfigPath = path.resolve(__dirname, "tauri.conf.json");
const cargoPath = path.resolve(__dirname, "Cargo.toml");

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, "utf8"));

if (!tauriConfig.package) {
  tauriConfig.package = {};
}

let changed = false;
if (tauriConfig.package.version !== pkg.version) {
  tauriConfig.package.version = pkg.version;
  changed = true;
}

const cargoToml = readFileSync(cargoPath, "utf8");
const versionPattern = /^version = "[^"]+"$/m;
const nextCargoToml = cargoToml.replace(versionPattern, `version = "${pkg.version}"`);
if (nextCargoToml !== cargoToml) {
  writeFileSync(cargoPath, nextCargoToml);
  changed = true;
}

if (changed) {
  writeFileSync(tauriConfigPath, `${JSON.stringify(tauriConfig, null, 2)}\n`);
  console.log(`Synced Tauri config to version ${pkg.version}`);
}
