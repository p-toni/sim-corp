import type { RoastEvent, TelemetryEnvelope, TelemetryPoint } from "@sim-corp/schemas";
import type { EventStore, StoredRoastEvent, StoredTelemetryPoint, TelemetryStore } from "./store";

export class IngestionHandlers {
  constructor(
    private readonly telemetryStore: TelemetryStore,
    private readonly eventStore: EventStore
  ) {}

  handleEnvelope(envelope: TelemetryEnvelope): void {
    switch (envelope.topic) {
      case "telemetry": {
        const payload = envelope.payload as TelemetryPoint;
        const storedPoint: StoredTelemetryPoint = {
          ...payload,
          ...envelope.origin
        };
        this.telemetryStore.add(storedPoint);
        return;
      }
      case "event": {
        const payload = envelope.payload as RoastEvent;
        const storedEvent: StoredRoastEvent = {
          ...payload,
          ...envelope.origin
        };
        this.eventStore.add(storedEvent);
        return;
      }
      default:
        return;
    }
  }
}
