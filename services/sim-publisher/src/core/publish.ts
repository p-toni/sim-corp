import { randomUUID } from "node:crypto";
import { TelemetryEnvelopeSchema } from "@sim-corp/schemas";
import type { TelemetryEnvelope } from "@sim-corp/schemas";
import { DeviceIdentityFactory, type ISigner, type IKeyStore } from "@sim-corp/device-identity";
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

async function buildEnvelope(
  origin: PublishRequest,
  topic: TelemetryEnvelope["topic"],
  payload: unknown,
  signer?: ISigner
): Promise<TelemetryEnvelope> {
  const envelope: TelemetryEnvelope = {
    ts: typeof (payload as { ts?: unknown }).ts === "string" ? (payload as { ts: string }).ts : new Date().toISOString(),
    origin: {
      orgId: origin.orgId,
      siteId: origin.siteId,
      machineId: origin.machineId
    },
    topic,
    payload
  };

  // Sign telemetry if signer is provided
  if (signer) {
    const kid = `device:${origin.machineId}@${origin.siteId}`;
    try {
      const signed = await signer.sign(payload as Record<string, unknown>, kid);
      envelope.sig = signed.sig;
      envelope.kid = kid;
    } catch (err) {
      // Log error but don't fail telemetry publishing
      console.error(`Failed to sign telemetry for ${kid}:`, err);
    }
  }

  return TelemetryEnvelopeSchema.parse(envelope);
}

export class SimPublisherManager {
  private readonly sessions = new Map<string, PublishSession>();
  private readonly keystore?: IKeyStore;
  private readonly signer?: ISigner;

  constructor(
    private readonly mqtt: MqttPublisher,
    private readonly simTwin: SimTwinClient,
    keystorePath?: string
  ) {
    // Use factory to create keystore and signer
    // Supports both file-based (dev) and HSM (production) modes
    if (keystorePath || process.env.DEVICE_IDENTITY_MODE) {
      try {
        const identity = keystorePath
          ? DeviceIdentityFactory.create({
              mode: "file",
              keystorePath,
              auditLogging: false
            })
          : DeviceIdentityFactory.createFromEnv();

        this.keystore = identity.keystore;
        this.signer = identity.signer;
      } catch (err) {
        console.error("Failed to initialize device identity:", err);
      }
    }
  }

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
          const envelope = await buildEnvelope(request, "telemetry", point, this.signer);
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
          const envelope = await buildEnvelope(request, "event", event, this.signer);
          await this.mqtt.publish(topic, JSON.stringify(envelope));
          stats.eventsSent += 1;
          stats.lastSentTs = envelope.ts;
        }, delayMs);
        cancelFns.push(() => clearTimeout(timer));
      });
    };
  }
}
