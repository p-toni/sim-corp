import { TelemetryEnvelopeSchema } from "@sim-corp/schemas";
import type { TelemetryEnvelope } from "@sim-corp/schemas";
import type { InferenceEngine } from "../core/engine";
import { formatEventsTopic, parseTelemetryTopic } from "../core/topic";
import type { MqttClient } from "./client";

const TELEMETRY_TOPIC = "roaster/+/+/+/telemetry";

export async function attachSubscriber(mqtt: MqttClient, engine: InferenceEngine): Promise<void> {
  await mqtt.subscribe(TELEMETRY_TOPIC, (topic, payload) => {
    const key = parseTelemetryTopic(topic);
    if (!key) return;
    try {
      const envelope = TelemetryEnvelopeSchema.parse(JSON.parse(payload.toString("utf-8")));
      if (envelope.topic !== "telemetry") return;
      const events = engine.handleTelemetry(envelope as TelemetryEnvelope);
      events.forEach((event) => {
        const outgoing: TelemetryEnvelope = {
          ts: new Date().toISOString(),
          origin: key,
          topic: "event",
          payload: event
        };
        const eventTopic = formatEventsTopic(key);
        void mqtt.publish(eventTopic, JSON.stringify(outgoing));
      });
    } catch (error) {
      // swallow invalid payloads to keep stream alive
      console.warn("event-inference: failed to process MQTT message", error);
    }
  });
}
