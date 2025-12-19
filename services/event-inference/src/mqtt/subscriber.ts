import { TelemetryEnvelopeSchema } from "@sim-corp/schemas";
import type { TelemetryEnvelope } from "@sim-corp/schemas";
import type { InferenceEngine } from "../core/engine";
import { formatEventsTopic, parseTelemetryTopic } from "../core/topic";
import type { MqttClient } from "./client";
import { createEnvelopeSigner } from "../core/signing";

const TELEMETRY_TOPIC = "roaster/+/+/+/telemetry";

export async function attachSubscriber(mqtt: MqttClient, engine: InferenceEngine): Promise<void> {
  const signer = createEnvelopeSigner({
    mode: process.env.SIGNING_MODE,
    kid: process.env.SIGNING_KID,
    privateKeyB64: process.env.SIGNING_PRIVATE_KEY_B64,
    defaultKid: process.env.SIGNING_KID ?? "service:event-inference@dev",
    orgId: process.env.SIGNING_ORG_ID ?? process.env.DEV_ORG_ID ?? "dev-org",
    kernelUrl: process.env.KERNEL_URL,
    logger: console
  });

  await mqtt.subscribe(TELEMETRY_TOPIC, (topic, payload) => {
    const key = parseTelemetryTopic(topic);
    if (!key) return;
    try {
      const envelope = TelemetryEnvelopeSchema.parse(JSON.parse(payload.toString("utf-8")));
      if (envelope.topic !== "telemetry") return;
      const events = engine.handleTelemetry(envelope as TelemetryEnvelope);
      events.forEach((event) => {
        void (async () => {
          const outgoing: TelemetryEnvelope = {
            ts: new Date().toISOString(),
            origin: key,
            topic: "event",
            payload: event
          };
          const kid = process.env.SIGNING_KID ?? `service:event-inference@${key.orgId}/${key.siteId}/${key.machineId}`;
          await signer.ensureRegistered(kid);
          const signed = signer.signEnvelope(outgoing, kid);
          const eventTopic = formatEventsTopic(key);
          await mqtt.publish(eventTopic, JSON.stringify(signed));
        })();
      });
    } catch (error) {
      // swallow invalid payloads to keep stream alive
      console.warn("event-inference: failed to process MQTT message", error);
    }
  });
}
