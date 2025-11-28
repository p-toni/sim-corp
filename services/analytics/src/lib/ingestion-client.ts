import {
  RoastEventSchema,
  RoastSessionSchema,
  RoastSessionSummarySchema,
  SessionMetaSchema,
  EventOverrideSchema,
  TelemetryPointSchema,
  SessionNoteSchema,
  type RoastEvent,
  type RoastSession,
  type RoastSessionSummary,
  type SessionMeta,
  type EventOverride,
  type SessionNote,
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

export async function fetchSessionMeta(sessionId: string): Promise<SessionMeta | null> {
  const res = await fetch(`${baseUrl()}/sessions/${sessionId}/meta`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`ingestion request failed ${res.status}`);
  }
  const json = await res.json();
  return SessionMetaSchema.parse(json);
}

export async function fetchSessionNotes(sessionId: string): Promise<SessionNote[]> {
  return fetchJson(`/sessions/${sessionId}/notes`, SessionNoteSchema.array());
}

export async function fetchEventOverrides(sessionId: string): Promise<EventOverride[]> {
  return fetchJson(`/sessions/${sessionId}/events/overrides`, EventOverrideSchema.array());
}
