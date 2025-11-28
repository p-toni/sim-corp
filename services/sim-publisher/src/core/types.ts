import type { RoastEvent, TelemetryEnvelope, TelemetryOrigin, TelemetryPoint } from "@sim-corp/schemas";
import type { SimRoastRequest } from "@sim-corp/sim-twin";

export interface PublishRequest extends SimRoastRequest, TelemetryOrigin {}

export interface PublishSessionStats {
  telemetrySent: number;
  eventsSent: number;
  lastSentTs?: string;
}

export interface PublishSession {
  id: string;
  request: PublishRequest;
  stats: PublishSessionStats;
  cancel: () => void;
}

export interface MqttPublisher {
  publish(topic: string, payload: string): Promise<void>;
}

export interface SimOutput {
  telemetry: TelemetryPoint[];
  events: RoastEvent[];
}

export interface SimTwinClient {
  runSimulation(request: SimRoastRequest): Promise<SimOutput>;
}
