import type { TelemetryPoint } from "@sim-corp/schemas";

export interface DriverConfig {
  orgId: string;
  siteId: string;
  machineId: string;
  connection: Record<string, unknown>;
}

export interface Driver {
  connect(): Promise<void>;
  readTelemetry(): Promise<TelemetryPoint>;
  disconnect(): Promise<void>;
}

export type DriverFactory = (cfg: DriverConfig) => Driver;
