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

For P0: real drivers should implement connect, capabilities, readLoop, health, and write can be a stub that always rejects with `ok: false` (read-only).

## Telemetry Envelope (Edge → Kernel)

```json
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
```

## MQTT Topics (P0)

```
roaster/{orgId}/{siteId}/{machineId}/telemetry
roaster/{orgId}/{siteId}/{machineId}/events
roaster/{orgId}/{siteId}/{machineId}/command (for later write path)
```
