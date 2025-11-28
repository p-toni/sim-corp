import type { RoastEvent, TelemetryEnvelope, TelemetryPoint } from "@sim-corp/schemas";
import type { EventStore, StoredRoastEvent, StoredTelemetryPoint, TelemetryStore } from "./store";
import type { PersistencePipeline } from "./persist";
import type { EnvelopeStream } from "./envelope-stream";

export class IngestionHandlers {
  constructor(
    private readonly telemetryStore: TelemetryStore,
    private readonly eventStore: EventStore,
    private readonly persist?: PersistencePipeline,
    private readonly envelopeStream?: EnvelopeStream
  ) {}

  handleEnvelope(envelope: TelemetryEnvelope): void {
    const persisted = this.persist ? this.persist.persistEnvelope(envelope) : envelope;
    switch (envelope.topic) {
      case "telemetry": {
        const payload = persisted.payload as TelemetryPoint;
        const storedPoint: StoredTelemetryPoint = {
          ...payload,
          ...persisted.origin
        };
        this.telemetryStore.add(storedPoint);
        this.envelopeStream?.publishTelemetry(persisted);
        return;
      }
      case "event": {
        const payload = persisted.payload as RoastEvent;
        const storedEvent: StoredRoastEvent = {
          ...payload,
          ...persisted.origin
        };
        this.eventStore.add(storedEvent);
        this.envelopeStream?.publishEvent(persisted);
        return;
      }
      default:
        return;
    }
  }
}
