# Repo Structure — High-Level Plan

> NOTE: This is conceptual; concrete folders will be created as we implement Sprint 0.

## Planned layout

```text
/apps
  /roaster-desktop        # Tauri + React UI for roaster operators

/services
  /company-kernel         # agent registry, policy, trace API, approvals
  /ingestion              # MQTT ingest → DB → push to UI
  /sim-twin               # digital twin + eval helpers

/agents
  /strategist
  /builder
  /operator
  /scientist
  /community
  /governor

/drivers
  /sim                    # simulated roaster
  /bullet-r1              # Aillio Bullet R1 (read-only P0)
  /modbus-tcp             # generic Modbus TCP driver for Giesen & similar

/libs
  /schemas                # shared types, Zod schemas, JSON Schemas
  /agent-runtime          # core Think→Act→Observe loop
  /logging                # OTel helpers, structured logging
  /config                 # config management

/infra
  /local                  # docker-compose: Postgres+Timescale, Mosquitto, OTel, Grafana

/docs
  /foundation
  /engineering

/tasks
  sprint0.md              # backlog for initial implementation
```

Keep this structure updated as the system evolves.

---

### `docs/engineering/contracts.md` 

```markdown
# Contracts — HAL, Telemetry, Topics

## HAL (Roaster Driver) Interface (TypeScript)

The hardware abstraction layer is the contract between the product and concrete roaster drivers.

```ts
export interface TelemetryPoint {
  ts: string; // ISO timestamp
  machineId: string;
  batchId?: string;
  elapsedSeconds: number;
  btC?: number;
  etC?: number;
  rorCPerMin?: number;
  gasPct?: number;
  fanPct?: number;
  drumRpm?: number;
  ambientC?: number;
}

export type RoastEventType =
  | "CHARGE"
  | "TP"
  | "FC"
  | "DEVELOPMENT_START"
  | "DROP"
  | "NOTE";

export interface RoastEvent {
  ts: string;
  machineId: string;
  batchId?: string;
  type: RoastEventType;
  payload?: Record<string, unknown>;
}

export interface RoasterDriverCapabilities {
  readable: string[];
  writable: string[];
  limits: Record<string, number>;
}

export interface RoasterDriver {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  capabilities(): Promise<RoasterDriverCapabilities>;
  readLoop(
    onTelemetry: (t: TelemetryPoint) => void,
    onEvent: (e: RoastEvent) => void
  ): () => void; // returns cancel
  write(cmd: {
    kind: "SET_GAS" | "SET_FAN" | "SET_DRUM";
    value: number;
    batchId?: string;
  }): Promise<{ ok: boolean; error?: string }>;
  health(): Promise<{ ok: boolean; detail?: string }>;
}
```

For P0:
real drivers should implement connect, capabilities, readLoop, health,
write can be a stub that always rejects with ok: false (read-only).
```
Telemetry Envelope (Edge → Kernel)
{
  "ts": "2025-11-11T23:20:43.123Z",
  "origin": {
    "orgId": "org-123",
    "siteId": "site-01",
    "machineId": "M-001"
  },
  "topic": "telemetry",
  "payload": {
    "elapsedSeconds": 42.3,
    "btC": 168.2,
    "etC": 201.5,
    "rorCPerMin": 9.1,
    "gasPct": 45,
    "fanPct": 30,
    "drumRpm": 55,
    "ambientC": 27.4
  },
  "sig": "base64-ed25519",
  "kid": "agent:RoasterAgent@site-01"
}

MQTT Topics (P0)
roaster/{orgId}/{siteId}/{machineId}/telemetry
roaster/{orgId}/{siteId}/{machineId}/events
roaster/{orgId}/{siteId}/{machineId}/command (for later write path)
```

---

### `docs/engineering/eval-and-autonomy.md` 

```markdown
# Evaluations & Autonomy Gates

## Goals

- Quantify whether we are improving roasting outcomes.
- Gate autonomy promotion (L2 → L3) on hard evidence.

## Golden cases

We will start with a small set of **golden roasts** for:
- different origins,
- processing methods,
- and target profiles.

Each golden case includes:
- machine & batch size,
- target FC and drop times,
- target development %, roast color,
- and expected sensory range.

## Metrics

For each batch, compute:

- **Timing error:**
  - |FC_actual - FC_target|,
  - |Drop_actual - Drop_target|.
- **Variance reduction:**
  - variance of key times/temps vs. historical baseline for that SKU.
- **RoR stability:**
  - number of spikes/crashes above defined thresholds.
- **Sensory uplift:**
  - change in cupping scores vs. baseline, when available.

## LM-as-Judge

Where appropriate, use a small model to score:
- plan clarity,
- physics plausibility (e.g. no impossible RoR behavior),
- respect for constraints,
- safety concerns (e.g. too aggressive gas steps).

## Autonomy promotion

To promote a behavior from L2 → L3:

- golden cases show equal or better metrics,
- no safety/physics violations,
- human pilots report acceptable UX,
- incident retrospectives show no new risk.

These rules should be implemented as code in the evaluation harness and enforced by the **Governor agent**.
```
