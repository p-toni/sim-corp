import { TelemetryEnvelopeSchema } from "@sim-corp/schemas";
import type { TelemetryEnvelope } from "@sim-corp/schemas";
import type { MqttClient } from "../mqtt-client";
import type { IngestionHandlers } from "./handlers";
import type { EnvelopeVerifier } from "./verification";

type Logger = Partial<Record<"debug" | "info" | "warn" | "error", (...args: unknown[]) => void>>;

interface AttachOptions {
  logger?: Logger;
  verifier?: EnvelopeVerifier;
}

const TELEMETRY_TOPIC = "roaster/+/+/+/telemetry";
const EVENT_TOPIC = "roaster/+/+/+/events";

export function attachMqttHandlers(
  client: MqttClient,
  handlers: IngestionHandlers,
  options: AttachOptions = {}
): void {
  const { logger = console, verifier } = options;
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

      if (verifier) {
        void verifier
          .verify(parsed.data)
          .then((verified) => handlers.handleEnvelope(verified))
          .catch((error) => {
            logger.warn?.("ingestion: signature verification failed", toSafeLogValue(error));
            handlers.handleEnvelope(parsed.data);
          });
        return;
      }

      handlers.handleEnvelope(parsed.data);
    })
    .catch((error: unknown) => {
      logger.error?.("ingestion: failed to subscribe to MQTT topics", toSafeLogValue(error));
    });
}

function parseEnvelope(topic: string, payload: Buffer, logger: Logger): TelemetryEnvelope | undefined {
  const topicParts = topic.split("/");
  if (topicParts.length !== 5) {
    logger.warn?.(`ingestion: received unsupported topic ${topic}`);
    return undefined;
  }

  const [root, orgId, siteId, machineId, suffix] = topicParts;
  if (root !== "roaster" || !orgId || !siteId || !machineId) {
    logger.warn?.(`ingestion: received unsupported topic ${topic}`);
    return undefined;
  }

  if (!isSupportedSuffix(suffix)) {
    const suffixLabel = suffix ?? "(missing)";
    logger.warn?.(`ingestion: unsupported topic suffix ${suffixLabel}`);
    return undefined;
  }

  const rawPayload = safeJsonParse(payload, logger);
  if (!rawPayload) {
    return undefined;
  }

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
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      logger.warn?.("ingestion: MQTT payload is not an object");
      return undefined;
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    logger.warn?.("ingestion: failed to parse MQTT message as JSON", toSafeLogValue(error));
    return undefined;
  }
}

function isSupportedSuffix(value: string | undefined): value is "telemetry" | "events" {
  return value === "telemetry" || value === "events";
}

function toSafeLogValue(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}
