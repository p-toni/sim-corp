#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

echo "Starting local stack (mqtt, kernel, ingestion, sim-twin, sim-publisher)..."
pnpm stack:up

echo "Stack is starting. Tail logs with: pnpm stack:logs"
echo
echo "Kick off a simulated roast publish session:"
cat <<'EOF'
curl -X POST http://127.0.0.1:4003/publish/start \
  -H "content-type: application/json" \
  -d '{
    "orgId": "org",
    "siteId": "site",
    "machineId": "SIM-MACHINE",
    "targetFirstCrackSeconds": 500,
    "targetDropSeconds": 650,
    "seed": 42,
    "sampleIntervalSeconds": 2,
    "noiseStdDev": 0.5
  }'
EOF

echo
echo "In roaster-desktop Live Mode use:"
echo "  ingestion URL: http://127.0.0.1:4001"
echo "  org/site/machine: org / site / SIM-MACHINE"
echo
echo "When done, stop the stack with: pnpm stack:down"
