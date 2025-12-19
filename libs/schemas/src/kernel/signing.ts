import type { TelemetryEnvelope, TelemetryOrigin, TelemetryTopic } from "./telemetry-envelope";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface SignableTelemetryEnvelope {
  ts: string;
  origin: TelemetryOrigin;
  topic: TelemetryTopic;
  payload: TelemetryEnvelope["payload"];
  sessionId?: string;
  kid?: string;
}

export function toSignableEnvelope(envelope: TelemetryEnvelope): SignableTelemetryEnvelope {
  const base: SignableTelemetryEnvelope = {
    ts: envelope.ts,
    origin: envelope.origin,
    topic: envelope.topic,
    payload: envelope.payload
  };
  if (envelope.sessionId) {
    base.sessionId = envelope.sessionId;
  }
  if (envelope.kid) {
    base.kid = envelope.kid;
  }
  return base;
}

export function getEnvelopeSigningBytes(envelope: TelemetryEnvelope): Uint8Array {
  const canonical = toSignableEnvelope(envelope);
  const json = stableStringify(canonical);
  return new TextEncoder().encode(json);
}

export function stableStringify(value: JsonValue): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item)) as JsonValue;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, JsonValue>;
    const sortedKeys = Object.keys(obj).sort();
    const result: Record<string, JsonValue> = {};
    for (const key of sortedKeys) {
      result[key] = canonicalize(obj[key]);
    }
    return result;
  }
  return value;
}
