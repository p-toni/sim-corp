import type { RoastEvent, TelemetryEnvelope, TelemetryPoint } from "@sim-corp/schemas";
import type { EventStore, StoredRoastEvent, StoredTelemetryPoint, TelemetryStore } from "./store";
import type { PersistencePipeline } from "./persist";
import type { EnvelopeStream } from "./envelope-stream";
import type { SignatureVerifier } from "./signature-verifier";

export class IngestionHandlers {
  constructor(
    private readonly telemetryStore: TelemetryStore,
    private readonly eventStore: EventStore,
    private readonly persist?: PersistencePipeline,
    private readonly envelopeStream?: EnvelopeStream,
    private readonly signatureVerifier?: SignatureVerifier
  ) {}

  async handleEnvelope(envelope: TelemetryEnvelope): Promise<void> {
    // Verify signature if verifier is available
    let verified = false;
    let verificationError: string | undefined;
    if (this.signatureVerifier) {
      const result = await this.signatureVerifier.verify(envelope);
      verified = result.verified;
      verificationError = result.error;

      if (verificationError) {
        console.warn(`Signature verification failed for ${envelope.kid}: ${verificationError}`);
      }
    }

    // Add verification metadata to envelope
    const envelopeWithTrust = {
      ...envelope,
      _verification: {
        verified,
        error: verificationError
      }
    };

    const persisted = this.persist ? this.persist.persistEnvelope(envelopeWithTrust) : envelopeWithTrust;
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
