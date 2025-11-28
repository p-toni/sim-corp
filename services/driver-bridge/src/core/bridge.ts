import { randomUUID } from "node:crypto";
import { TelemetryEnvelopeSchema } from "@sim-corp/schemas";
import type { TelemetryEnvelope } from "@sim-corp/schemas";
import type { DriverConfig, DriverFactory } from "@sim-corp/driver-core";
import type { MqttPublisher } from "../mqtt/publisher";

export interface BridgeStats {
  samplesPublished: number;
  lastPublishedAt?: string;
  lastError?: string;
  isRunning: boolean;
}

export interface BridgeSession {
  id: string;
  driver: Awaited<ReturnType<DriverFactory>>;
  config: DriverConfig;
  stats: BridgeStats;
  stop: () => Promise<void>;
}

interface BridgeDependencies {
  driverFactory: DriverFactory;
  mqttPublisher: MqttPublisher;
  pollIntervalSeconds?: number;
}

export class DriverBridge {
  private sessions = new Map<string, BridgeSession>();

  constructor(private readonly deps: BridgeDependencies) {}

  list(): BridgeSession[] {
    return Array.from(this.sessions.values());
  }

  get(sessionId: string): BridgeSession | undefined {
    return this.sessions.get(sessionId);
  }

  async start(config: DriverConfig, driverFactoryOverride?: DriverFactory): Promise<BridgeSession> {
    const id = randomUUID();
    const stats: BridgeStats = { samplesPublished: 0, isRunning: true };
    const driverFactory = driverFactoryOverride ?? this.deps.driverFactory;
    const driver = driverFactory(config);
    await driver.connect();

    const intervalMs = Math.max(
      100,
      Math.round(
        (typeof config.connection.sampleIntervalSeconds === "number"
          ? config.connection.sampleIntervalSeconds
          : this.deps.pollIntervalSeconds ?? Number(process.env.BRIDGE_SAMPLE_INTERVAL_SECONDS ?? 2)) * 1000
      )
    );

    const timer = setInterval(async () => {
      if (!this.sessions.has(id)) {
        clearInterval(timer);
        return;
      }
      try {
        const point = await driver.readTelemetry();
        const envelope = TelemetryEnvelopeSchema.parse({
          ts: new Date().toISOString(),
          origin: {
            orgId: config.orgId,
            siteId: config.siteId,
            machineId: config.machineId
          },
          topic: "telemetry",
          payload: point
        }) as TelemetryEnvelope;

        const topic = `roaster/${config.orgId}/${config.siteId}/${config.machineId}/telemetry`;
        await this.deps.mqttPublisher.publish(topic, JSON.stringify(envelope));
        stats.samplesPublished += 1;
        stats.lastPublishedAt = envelope.ts;
      } catch (error) {
        stats.lastError = error instanceof Error ? error.message : String(error);
      }
    }, intervalMs);

    const stop = async (): Promise<void> => {
      clearInterval(timer);
      stats.isRunning = false;
      await driver.disconnect();
      this.sessions.delete(id);
    };

    const session: BridgeSession = {
      id,
      driver,
      config,
      stats,
      stop
    };

    this.sessions.set(id, session);
    return session;
  }

  async stop(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    await session.stop();
    return true;
  }
}
