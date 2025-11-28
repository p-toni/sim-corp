import {
  RoastEventSchema,
  RoastSessionSchema,
  RoastSessionSummarySchema,
  TelemetryPointSchema,
  type RoastEvent,
  type RoastSession,
  type RoastSessionSummary,
  type TelemetryPoint
} from "@sim-corp/schemas";

const DEFAULT_INGESTION_URL = "http://127.0.0.1:4001";

function baseUrl(): string {
  return (process.env.INGESTION_URL ?? DEFAULT_INGESTION_URL).replace(/\/$/, "");
}

async function fetchJson<T>(
  path: string,
  schema: { parse: (value: unknown) => T }
): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`);
  if (!res.ok) {
    throw new Error(`ingestion request failed ${res.status}`);
  }
  const json = await res.json();
  return schema.parse(json);
}

export async function fetchSession(sessionId: string): Promise<RoastSession> {
  return fetchJson(`/sessions/${sessionId}`, RoastSessionSchema);
}

export async function fetchSessionSummary(sessionId: string): Promise<RoastSessionSummary> {
  return fetchJson(`/sessions/${sessionId}`, RoastSessionSummarySchema);
}

export async function fetchSessionTelemetry(sessionId: string): Promise<TelemetryPoint[]> {
  return fetchJson(`/sessions/${sessionId}/telemetry`, TelemetryPointSchema.array());
}

export async function fetchSessionEvents(sessionId: string): Promise<RoastEvent[]> {
  return fetchJson(`/sessions/${sessionId}/events`, RoastEventSchema.array());
}
