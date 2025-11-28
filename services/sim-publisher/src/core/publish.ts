import { randomUUID } from "node:crypto";
import { TelemetryEnvelopeSchema } from "@sim-corp/schemas";
import type { TelemetryEnvelope } from "@sim-corp/schemas";
import type {
  MqttPublisher,
  PublishRequest,
  PublishSession,
  PublishSessionStats,
  SimOutput,
  SimTwinClient
} from "./types";

const MIN_INTERVAL_MS = 50;
const MAX_BUFFER = 5_000;

function topicFor(origin: PublishRequest, suffix: "telemetry" | "events"): string {
  return `roaster/${origin.orgId}/${origin.siteId}/${origin.machineId}/${suffix}`;
}

function buildEnvelope(origin: PublishRequest, topic: TelemetryEnvelope["topic"], payload: unknown): TelemetryEnvelope {
  return TelemetryEnvelopeSchema.parse({
    ts: typeof (payload as { ts?: unknown }).ts === "string" ? (payload as { ts: string }).ts : new Date().toISOString(),
    origin: {
      orgId: origin.orgId,
      siteId: origin.siteId,
      machineId: origin.machineId
    },
    topic,
    payload
  });
}

export class SimPublisherManager {
  private readonly sessions = new Map<string, PublishSession>();

  constructor(
    private readonly mqtt: MqttPublisher,
    private readonly simTwin: SimTwinClient
  ) {}

  listSessions(): PublishSession[] {
    return Array.from(this.sessions.values());
  }

  getSession(id: string): PublishSession | undefined {
    return this.sessions.get(id);
  }

  async start(request: PublishRequest): Promise<PublishSession> {
    const output = await this.simTwin.runSimulation(request);
    const sessionId = randomUUID();
    const stats: PublishSessionStats = { telemetrySent: 0, eventsSent: 0 };

    const cancelFns: Array<() => void> = [];
    const publishTelemetry = this.scheduleTelemetry(sessionId, request, output, stats, cancelFns);
    const publishEvents = this.scheduleEvents(sessionId, request, output, stats, cancelFns);

    const cancel = (): void => {
      cancelFns.forEach((fn) => fn());
      this.sessions.delete(sessionId);
    };

    const session: PublishSession = {
      id: sessionId,
      request,
      stats,
      cancel
    };

    this.sessions.set(sessionId, session);
    publishTelemetry();
    publishEvents();
    return session;
  }

  stop(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.cancel();
    return true;
  }

  private scheduleTelemetry(
    sessionId: string,
    request: PublishRequest,
    output: SimOutput,
    stats: PublishSessionStats,
    cancelFns: Array<() => void>
  ): () => void {
    const telemetry = output.telemetry.slice(0, MAX_BUFFER);
    const topic = topicFor(request, "telemetry");
    const startAt = Date.now();

    return () => {
      telemetry.forEach((point, idx) => {
        const delayMs = Math.max(MIN_INTERVAL_MS, Math.round(point.elapsedSeconds * 1000));
        const timer = setTimeout(async () => {
          if (!this.sessions.has(sessionId)) return;
          const envelope = buildEnvelope(request, "telemetry", point);
          await this.mqtt.publish(topic, JSON.stringify(envelope));
          stats.telemetrySent += 1;
          stats.lastSentTs = envelope.ts;
        }, delayMs);
        cancelFns.push(() => clearTimeout(timer));
        if (idx === 0 && delayMs === 0) {
          // ensure first point schedules immediately to avoid 0ms drift
          timer.ref?.();
        }
      });
    };
  }

  private scheduleEvents(
    sessionId: string,
    request: PublishRequest,
    output: SimOutput,
    stats: PublishSessionStats,
    cancelFns: Array<() => void>
  ): () => void {
    const events = output.events.slice(0, MAX_BUFFER);
    const topic = topicFor(request, "events");

    return () => {
      events.forEach((event) => {
        const elapsed = typeof event.payload?.elapsedSeconds === "number"
          ? event.payload.elapsedSeconds
          : 0;
        const delayMs = Math.max(MIN_INTERVAL_MS, Math.round(elapsed * 1000));
        const timer = setTimeout(async () => {
          if (!this.sessions.has(sessionId)) return;
          const envelope = buildEnvelope(request, "event", event);
          await this.mqtt.publish(topic, JSON.stringify(envelope));
          stats.eventsSent += 1;
          stats.lastSentTs = envelope.ts;
        }, delayMs);
        cancelFns.push(() => clearTimeout(timer));
      });
    };
  }
}
