import type { RoastEventRecord, TelemetryRecord, TelemetryOrigin } from "@sim-corp/schemas";

export interface TelemetryQuery {
  orgId?: string;
  siteId?: string;
  machineId?: string;
  limit?: number;
}

export type StoredTelemetryPoint = TelemetryRecord & TelemetryOrigin;

export class TelemetryStore {
  private readonly telemetry: StoredTelemetryPoint[] = [];
  private readonly subscribers: Array<{ filter: TelemetryQuery; fn: (point: StoredTelemetryPoint) => void }> = [];

  add(point: StoredTelemetryPoint): void {
    this.telemetry.push(point);
    this.subscribers.forEach(({ filter, fn }) => {
      if (matchesFilter(filter, point)) {
        fn(point);
      }
    });
  }

  query(q: TelemetryQuery = {}): StoredTelemetryPoint[] {
    const { orgId, siteId, machineId, limit } = q;
    const results = this.telemetry
      .filter((point) =>
        [
          [orgId, point.orgId],
          [siteId, point.siteId],
          [machineId, point.machineId]
        ].every(([expected, actual]) => (expected ? actual === expected : true))
      )
      .sort((a, b) => b.ts.localeCompare(a.ts));

    if (typeof limit === "number" && limit >= 0) {
      return results.slice(0, limit);
    }
    return results;
  }

  subscribe(filter: TelemetryQuery, fn: (point: StoredTelemetryPoint) => void): () => void {
    const entry = { filter, fn };
    this.subscribers.push(entry);
    return () => {
      const idx = this.subscribers.indexOf(entry);
      if (idx >= 0) {
        this.subscribers.splice(idx, 1);
      }
    };
  }
}

export type EventQuery = TelemetryQuery;

export type StoredRoastEvent = RoastEventRecord & TelemetryOrigin;

export class EventStore {
  private readonly events: StoredRoastEvent[] = [];
  private readonly subscribers: Array<{ filter: EventQuery; fn: (event: StoredRoastEvent) => void }> = [];

  add(evt: StoredRoastEvent): void {
    this.events.push(evt);
    this.subscribers.forEach(({ filter, fn }) => {
      if (matchesFilter(filter, evt)) {
        fn(evt);
      }
    });
  }

  query(q: EventQuery = {}): StoredRoastEvent[] {
    const { orgId, siteId, machineId, limit } = q;
    const results = this.events
      .filter((event) =>
        [
          [orgId, event.orgId],
          [siteId, event.siteId],
          [machineId, event.machineId]
        ].every(([expected, actual]) => (expected ? actual === expected : true))
      )
      .sort((a, b) => b.ts.localeCompare(a.ts));

    if (typeof limit === "number" && limit >= 0) {
      return results.slice(0, limit);
    }
    return results;
  }

  subscribe(filter: EventQuery, fn: (event: StoredRoastEvent) => void): () => void {
    const entry = { filter, fn };
    this.subscribers.push(entry);
    return () => {
      const idx = this.subscribers.indexOf(entry);
      if (idx >= 0) {
        this.subscribers.splice(idx, 1);
      }
    };
  }
}

function matchesFilter(filter: TelemetryQuery, origin: TelemetryOrigin): boolean {
  return (
    (filter.orgId ? origin.orgId === filter.orgId : true) &&
    (filter.siteId ? origin.siteId === filter.siteId : true) &&
    (filter.machineId ? origin.machineId === filter.machineId : true)
  );
}
