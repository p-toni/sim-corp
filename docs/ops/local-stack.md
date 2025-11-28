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
- event-inference: 4005
- analytics: 4006
- report-worker: 4007
- dispatcher: 4010

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

## Inferred events (event-inference)
- event-inference listens on MQTT telemetry and emits CHARGE/TP/FC/DROP to `/events`.
- With driver-bridge running, you should see FC/DROP markers appear automatically in Live Mode.

## Analyze a session (analytics)
- Fetch analysis for a session:
```bash
curl http://127.0.0.1:4006/analysis/session/<SESSION_ID>
```
- In roaster-desktop Playback Mode, set Analytics URL `http://127.0.0.1:4006`, pick a session, and view analysis panel + phase overlays.

## QC + Ground Truth (meta, notes, overrides)
- Attach meta to a session:
```bash
curl -X PUT http://127.0.0.1:4001/sessions/<SESSION_ID>/meta \
  -H "content-type: application/json" \
  -d '{"beanName":"Colombia","process":"washed","operator":"sam","tags":["washed","lot-42"]}'
```

- Add a note:
```bash
curl -X POST http://127.0.0.1:4001/sessions/<SESSION_ID>/notes \
  -H "content-type: application/json" \
  -d '{"title":"QC","text":"Sweet, balanced","cuppingScore":85}'
```

- Override event times (seconds elapsed):
```bash
curl -X PUT http://127.0.0.1:4001/sessions/<SESSION_ID>/events/overrides \
  -H "content-type: application/json" \
  -d '{"overrides":[{"eventType":"FC","elapsedSeconds":480,"updatedAt":"'\"'\"$(date -Iseconds)'\"'\""}]}'
```
Refresh analytics (`/analysis/session/<SESSION_ID>`) or the Playback Analysis panel to see updated markers and deltas.

## Post-roast report loop (dispatcher + report-worker)
- ingestion publishes `session.closed` ops events to MQTT when `INGESTION_OPS_EVENTS_ENABLED=true` (set in compose). If publishing fails, it falls back to direct kernel enqueue while `INGESTION_KERNEL_ENQUEUE_FALLBACK_ENABLED=true`.
- dispatcher subscribes to `ops/+/+/+/session/closed`, enqueues `generate-roast-report` missions with idempotency keys (`generate-roast-report:<reportKind>:<sessionId>`), and exposes status at `:4010/status`.
- report-worker polls company-kernel for missions (slower default polling), runs `roast-report-agent`, posts the trace to kernel, and saves the report via ingestion.

Quick checks:
```bash
# dispatcher status / counters
curl http://127.0.0.1:4010/status

# see the latest report for a session
curl http://127.0.0.1:4001/sessions/<SESSION_ID>/reports/latest

# enqueue manually
curl -X POST http://127.0.0.1:3000/missions -H "content-type: application/json" \
  -d '{"goal":"generate-roast-report","params":{"sessionId":"<SESSION_ID>"}}'

# worker status
curl http://127.0.0.1:4007/status
```

In roaster-desktop Playback, open the Report tab to refresh or queue a report for the selected session.

## Stop the stack
```bash
pnpm stack:down
```
