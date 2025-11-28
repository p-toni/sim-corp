import type { TelemetryEnvelope } from "@sim-corp/schemas";
import type { TelemetryQuery } from "./store";

type EnvelopeFilter = TelemetryQuery;

export class EnvelopeStream {
  private readonly telemetrySubscribers: Array<{ filter: EnvelopeFilter; fn: (env: TelemetryEnvelope) => void }> = [];
  private readonly eventSubscribers: Array<{ filter: EnvelopeFilter; fn: (env: TelemetryEnvelope) => void }> = [];

  publishTelemetry(env: TelemetryEnvelope): void {
    this.telemetrySubscribers.forEach(({ filter, fn }) => {
      if (matches(filter, env.origin)) {
        fn(env);
      }
    });
  }

  publishEvent(env: TelemetryEnvelope): void {
    this.eventSubscribers.forEach(({ filter, fn }) => {
      if (matches(filter, env.origin)) {
        fn(env);
      }
    });
  }

  subscribeTelemetry(filter: EnvelopeFilter, fn: (env: TelemetryEnvelope) => void): () => void {
    const entry = { filter, fn };
    this.telemetrySubscribers.push(entry);
    return () => {
      const idx = this.telemetrySubscribers.indexOf(entry);
      if (idx >= 0) this.telemetrySubscribers.splice(idx, 1);
    };
  }

  subscribeEvents(filter: EnvelopeFilter, fn: (env: TelemetryEnvelope) => void): () => void {
    const entry = { filter, fn };
    this.eventSubscribers.push(entry);
    return () => {
      const idx = this.eventSubscribers.indexOf(entry);
      if (idx >= 0) this.eventSubscribers.splice(idx, 1);
    };
  }
}

function matches(filter: EnvelopeFilter, origin: TelemetryEnvelope["origin"]): boolean {
  return (
    (filter.orgId ? origin.orgId === filter.orgId : true) &&
    (filter.siteId ? origin.siteId === filter.siteId : true) &&
    (filter.machineId ? origin.machineId === filter.machineId : true)
  );
}
