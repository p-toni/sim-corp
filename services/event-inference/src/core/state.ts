import { randomUUID } from "node:crypto";
import type { TelemetryPoint } from "@sim-corp/schemas";
import type { MachineHeuristicsConfig } from "./config";

export interface MachineKey {
  orgId: string;
  siteId: string;
  machineId: string;
}

export interface SessionState {
  sessionId: string;
  startedAtIso: string;
  lastSeenAtIso: string;
  lastTelemetry?: TelemetryPoint;
  telemetry: TelemetryPoint[];
  emitted: {
    charge: boolean;
    tp: boolean;
    fc: boolean;
    drop: boolean;
  };
}

export interface MachineStatus extends MachineKey {
  sessionId?: string;
  startedAtIso?: string;
  lastSeenAtIso?: string;
  emitted?: SessionState["emitted"];
  telemetryCount: number;
}

export class StateStore {
  private readonly sessions = new Map<string, SessionState>();

  get(key: MachineKey): SessionState | undefined {
    return this.sessions.get(toKey(key));
  }

  ensureSession(key: MachineKey): SessionState {
    const existing = this.sessions.get(toKey(key));
    if (existing) return existing;

    const nowIso = new Date().toISOString();
    const session: SessionState = {
      sessionId: randomUUID(),
      startedAtIso: nowIso,
      lastSeenAtIso: nowIso,
      telemetry: [],
      emitted: { charge: false, tp: false, fc: false, drop: false }
    };
    this.sessions.set(toKey(key), session);
    return session;
  }

  appendTelemetry(
    key: MachineKey,
    point: TelemetryPoint,
    cfg: MachineHeuristicsConfig
  ): SessionState {
    const session = this.ensureSession(key);
    session.telemetry = appendWithLimitLocal(session.telemetry, point, cfg.maxBufferPoints);
    session.lastTelemetry = point;
    session.lastSeenAtIso = new Date().toISOString();
    return session;
  }

  endSession(key: MachineKey): void {
    this.sessions.delete(toKey(key));
  }

  snapshot(): MachineStatus[] {
    return Array.from(this.sessions.entries()).map(([key, session]) => {
      const [orgId, siteId, machineId] = key.split("|");
      return {
        orgId,
        siteId,
        machineId,
        sessionId: session.sessionId,
        startedAtIso: session.startedAtIso,
        lastSeenAtIso: session.lastSeenAtIso,
        emitted: session.emitted,
        telemetryCount: session.telemetry.length
      };
    });
  }
}

function toKey(key: MachineKey): string {
  return `${key.orgId}|${key.siteId}|${key.machineId}`;
}

function appendWithLimitLocal<T>(buffer: T[], item: T, limit = 2000): T[] {
  const next = [...buffer, item];
  if (next.length > limit) {
    return next.slice(next.length - limit);
  }
  return next;
}
