# Local Stack Runbook (T-010)

Spin up the full simulated stack (MQTT + services) and exercise live telemetry end-to-end.

## Prereqs
- Docker / Docker Compose
- pnpm deps installed locally (`pnpm install` in repo root)

## Start the stack
```bash
pnpm stack:up
# follow logs if needed
pnpm stack:logs
```

Services:
- Mosquitto: 1883 (9001 websocket)
- company-kernel: 3000
- ingestion: 4001
- sim-twin: 4002
- sim-publisher: 4003
- driver-bridge: 4004

## Start roaster-desktop (optional UI)
```bash
pnpm --filter @sim-corp/roaster-desktop dev
# open http://127.0.0.1:5173 (or Vite dev port)
```

## Publish a simulated roast
```bash
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
```

## Watch live telemetry
- In roaster-desktop Live Mode:
  - Ingestion URL: `http://127.0.0.1:4001`
  - orgId/siteId/machineId: `org` / `site` / `SIM-MACHINE`
  - Start Live → curves update and event markers appear.

### Quick CLI checks
```bash
# SSE telemetry stream (hit Ctrl+C when satisfied)
curl http://127.0.0.1:4001/stream/telemetry?orgId=org&siteId=site&machineId=SIM-MACHINE

# Recent telemetry/events via REST
curl "http://127.0.0.1:4001/telemetry?orgId=org&siteId=site&machineId=SIM-MACHINE&limit=5"
curl "http://127.0.0.1:4001/events?orgId=org&siteId=site&machineId=SIM-MACHINE&limit=5"
```

## Retrieve traces from company-kernel
```bash
curl http://127.0.0.1:3000/traces
```
(Traces appear if posting to kernel is enabled in the UI.)

## Shadow-mode driver bridge (FakeDriver)
```bash
curl -X POST http://127.0.0.1:4004/bridge/start \
  -H "content-type: application/json" \
  -d '{
    "driverName": "fake",
    "config": {
      "orgId": "org",
      "siteId": "site",
      "machineId": "SIM-MACHINE",
      "connection": { "seed": 7, "sampleIntervalSeconds": 2 }
    }
  }'
```

Point roaster-desktop Live Mode at ingestion `http://127.0.0.1:4001` with the same org/site/machine to see the streamed telemetry.

## Stop the stack
```bash
pnpm stack:down
```
