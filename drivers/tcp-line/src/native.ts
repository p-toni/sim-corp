import { createRequire } from "node:module";
import type { TelemetryPoint } from "@sim-corp/schemas";
import type { DriverStatus } from "./metrics";

const require = createRequire(import.meta.url);

type NativeTelemetry = TelemetryPoint & {
  extras?: Array<{ key: string; number_value?: number; text_value?: string }>;
};

type NativeModule = {
  TcpLineDriverNative: new (configJson: string, machineId: string) => {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    readTelemetry(): Promise<NativeTelemetry>;
    getStatus(): DriverStatus;
  };
};

let cached: NativeModule | null = null;

export function loadNative(): NativeModule {
  if (!cached) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cached = require("../native/index.node") as NativeModule;
  }
  return cached;
}

export function convertExtras(extras?: NativeTelemetry["extras"]): TelemetryPoint["extras"] {
  if (!extras || extras.length === 0) return {};
  return extras.reduce<Record<string, number | string>>((acc, entry) => {
    if (entry.number_value !== undefined) {
      acc[entry.key] = entry.number_value;
    } else if (entry.text_value !== undefined) {
      acc[entry.key] = entry.text_value;
    }
    return acc;
  }, {});
}
