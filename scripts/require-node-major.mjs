#!/usr/bin/env node

const requiredMajor = Number(process.argv[2] ?? 20);
const actual = process.versions.node;
const actualMajor = Number(actual.split(".")[0]);

if (!Number.isInteger(requiredMajor) || requiredMajor <= 0) {
  console.error("require-node-major: expected a positive integer major version");
  process.exit(1);
}

if (actualMajor !== requiredMajor) {
  console.error(
    `Node ${actual} detected; need Node ${requiredMajor}. Run "nvm use ${requiredMajor}" (see .nvmrc) and reinstall deps.`
  );
  process.exit(1);
}
