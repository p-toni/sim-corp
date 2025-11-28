import type { RoastEvent, TelemetryPoint, TelemetryOrigin } from "@sim-corp/schemas";

export interface TelemetryQuery {
  orgId?: string;
  siteId?: string;
  machineId?: string;
  limit?: number;
}

export type StoredTelemetryPoint = TelemetryPoint & TelemetryOrigin;

export class TelemetryStore {
  private readonly telemetry: StoredTelemetryPoint[] = [];

  add(point: StoredTelemetryPoint): void {
    this.telemetry.push(point);
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
}

export type EventQuery = TelemetryQuery;

export type StoredRoastEvent = RoastEvent & TelemetryOrigin;

export class EventStore {
  private readonly events: StoredRoastEvent[] = [];

  add(evt: StoredRoastEvent): void {
    this.events.push(evt);
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
}
