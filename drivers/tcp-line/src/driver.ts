import type { Driver, DriverConfig } from "@sim-corp/driver-core";
import type { TelemetryPoint } from "@sim-corp/schemas";
import { TcpLineDriverConfigSchema, type TcpLineDriverConfig } from "./config";
import type { DriverStatus } from "./metrics";
import { convertExtras, loadNative } from "./native";

export class TcpLineDriver implements Driver {
  private readonly config: TcpLineDriverConfig;
  private readonly native: InstanceType<ReturnType<typeof loadNative>["TcpLineDriverNative"]>;

  constructor(private readonly cfg: DriverConfig) {
    this.config = TcpLineDriverConfigSchema.parse({
      ...(cfg.connection ?? {})
    });
    const { TcpLineDriverNative } = loadNative();
    this.native = new TcpLineDriverNative(JSON.stringify(this.config), cfg.machineId);
  }

  async connect(): Promise<void> {
    await this.native.connect();
  }

  async readTelemetry(): Promise<TelemetryPoint> {
    const point = await this.native.readTelemetry();
    return {
      ...point,
      extras: convertExtras(point.extras)
    };
  }

  async disconnect(): Promise<void> {
    await this.native.disconnect();
  }

  getStatus(): DriverStatus {
    return this.native.getStatus();
  }
}
