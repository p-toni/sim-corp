import type { TelemetryEnvelope } from "@sim-corp/schemas";
import type { RoastEvent } from "@sim-corp/schemas";
import { generateSessionId } from "./ids";

interface SessionState {
  sessionId: string;
  startedAt: string;
  lastSeenAt: string;
  lastTelemetryTs?: string;
  orgId: string;
  siteId: string;
  machineId: string;
}

interface SessionizerConfig {
  sessionGapSeconds?: number;
  closeSilenceSeconds?: number;
}

export class Sessionizer {
  private readonly sessions = new Map<string, SessionState>();
  private readonly sessionGapSeconds: number;
  private readonly closeSilenceSeconds: number;

  constructor(config: SessionizerConfig = {}) {
    this.sessionGapSeconds = config.sessionGapSeconds ?? 30;
    this.closeSilenceSeconds = config.closeSilenceSeconds ?? 15;
  }

  assignSession(envelope: TelemetryEnvelope): TelemetryEnvelope {
    const key = this.toKey(envelope.origin.orgId, envelope.origin.siteId, envelope.origin.machineId);
    const nowIso = envelope.ts;

    const incomingSessionId = envelope.sessionId;
    const state = this.sessions.get(key);
    const nowMs = Date.parse(nowIso);
    const lastSeenMs = state ? Date.parse(state.lastSeenAt) : undefined;
    const gapExceeded =
      typeof lastSeenMs === "number" && Number.isFinite(lastSeenMs)
        ? (nowMs - lastSeenMs) / 1000 > this.sessionGapSeconds
        : false;

    if (!state || gapExceeded) {
      const sessionId = incomingSessionId ?? generateSessionId(envelope.origin);
      const newState: SessionState = {
        sessionId,
        startedAt: nowIso,
        lastSeenAt: nowIso,
        lastTelemetryTs: envelope.topic === "telemetry" ? nowIso : state?.lastTelemetryTs,
        orgId: envelope.origin.orgId,
        siteId: envelope.origin.siteId,
        machineId: envelope.origin.machineId
      };
      this.sessions.set(key, newState);
      return { ...envelope, sessionId };
    }

    // keep existing session
    state.lastSeenAt = nowIso;
    if (envelope.topic === "telemetry") {
      state.lastTelemetryTs = nowIso;
    }
    const sessionId = incomingSessionId ?? state.sessionId;
    return { ...envelope, sessionId };
  }

  handleEvent(envelope: TelemetryEnvelope): void {
    if (envelope.topic !== "event") return;
    const event = envelope.payload as RoastEvent;
    if (event.type !== "DROP") return;
    const key = this.toKey(envelope.origin.orgId, envelope.origin.siteId, envelope.origin.machineId);
    this.sessions.delete(key);
  }

  tick(nowIso: string): SessionState[] {
    const nowMs = Date.parse(nowIso);
    const closed: SessionState[] = [];
    for (const [key, state] of this.sessions.entries()) {
      const lastSeenMs = Date.parse(state.lastSeenAt);
      if (!Number.isFinite(lastSeenMs)) continue;
      const silenceSeconds = (nowMs - lastSeenMs) / 1000;
      if (silenceSeconds > this.closeSilenceSeconds) {
        closed.push(state);
        this.sessions.delete(key);
      }
    }
    return closed;
  }

  private toKey(orgId: string, siteId: string, machineId: string): string {
    return `${orgId}|${siteId}|${machineId}`;
  }
}
