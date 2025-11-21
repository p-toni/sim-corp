import { TelemetryEnvelopeSchema, type TelemetryEnvelope } from "@sim-corp/schemas";
import type { MqttClient } from "../mqtt-client";
import { IngestionHandlers } from "./handlers";

type Logger = Partial<Record<"debug" | "info" | "warn" | "error", (...args: unknown[]) => void>>;

interface AttachOptions {
  logger?: Logger;
}

const TELEMETRY_TOPIC = "roaster/+/+/+/telemetry";
const EVENT_TOPIC = "roaster/+/+/+/events";

export function attachMqttHandlers(
  client: MqttClient,
  handlers: IngestionHandlers,
  options: AttachOptions = {}
): void {
  const { logger = console } = options;
  const topics: string[] = [TELEMETRY_TOPIC, EVENT_TOPIC];

  client
    .subscribe(topics, (topic: string, payload: Buffer) => {
      const envelope = parseEnvelope(topic, payload, logger);
      if (!envelope) {
        return;
      }

      const parsed = TelemetryEnvelopeSchema.safeParse(envelope);
      if (!parsed.success) {
        logger.warn?.("ingestion: invalid telemetry envelope", parsed.error);
        return;
      }

      handlers.handleEnvelope(parsed.data);
    })
    .catch((error: unknown) => {
      logger.error?.("ingestion: failed to subscribe to MQTT topics", error);
    });
}

function parseEnvelope(topic: string, payload: Buffer, logger: Logger): TelemetryEnvelope | undefined {
  const topicParts = topic.split("/");
  if (topicParts.length !== 5 || topicParts[0] !== "roaster") {
    logger.warn?.(`ingestion: received unsupported topic ${topic}`);
    return undefined;
  }

  const suffix = topicParts[4];
  if (suffix !== "telemetry" && suffix !== "events") {
    logger.warn?.(`ingestion: unsupported topic suffix ${suffix}`);
    return undefined;
  }

  const rawPayload = safeJsonParse(payload, logger);
  if (!rawPayload) {
    return undefined;
  }

  const orgId = topicParts[1]!;
  const siteId = topicParts[2]!;
  const machineId = topicParts[3]!;

  const ts = typeof rawPayload.ts === "string" ? rawPayload.ts : new Date().toISOString();
  const sig = typeof rawPayload.sig === "string" ? rawPayload.sig : undefined;
  const kid = typeof rawPayload.kid === "string" ? rawPayload.kid : undefined;

  const envelope: TelemetryEnvelope = {
    ts,
    origin: { orgId, siteId, machineId },
    topic: suffix === "events" ? "event" : "telemetry",
    payload: rawPayload as TelemetryEnvelope["payload"],
    sig,
    kid
  };

  return envelope;
}

function safeJsonParse(buffer: Buffer, logger: Logger): Record<string, unknown> | undefined {
  try {
    const text = buffer.toString("utf-8");
    return JSON.parse(text) as Record<string, unknown>;
  } catch (error) {
    logger.warn?.("ingestion: failed to parse MQTT message as JSON", error);
    return undefined;
  }
}
