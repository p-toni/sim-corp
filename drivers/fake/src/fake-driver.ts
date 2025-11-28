import type { TelemetryPoint } from "@sim-corp/schemas";
import type { Driver, DriverConfig } from "@sim-corp/driver-core";

interface FakeDriverConfig extends DriverConfig {
  connection: DriverConfig["connection"] & {
    sampleIntervalSeconds?: number;
    seed?: number;
  };
}

type Rng = () => number;

function createRng(seed: number | undefined): Rng {
  let state = (seed ?? Date.now()) >>> 0;
  if (state === 0) state = 0x1abcdef;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export class FakeDriver implements Driver {
  private elapsedSeconds = 0;
  private rng: Rng;
  private readonly sampleIntervalSeconds: number;
  private connected = false;

  constructor(private readonly cfg: FakeDriverConfig) {
    this.sampleIntervalSeconds =
      typeof cfg.connection.sampleIntervalSeconds === "number"
        ? cfg.connection.sampleIntervalSeconds
        : 2;
    this.rng = createRng(
      typeof cfg.connection.seed === "number" ? cfg.connection.seed : undefined
    );
  }

  async connect(): Promise<void> {
    this.connected = true;
    this.elapsedSeconds = 0;
  }

  async readTelemetry(): Promise<TelemetryPoint> {
    if (!this.connected) {
      throw new Error("Driver not connected");
    }

    const progress = this.elapsedSeconds / 700;
    const btBase = 180 + 60 * Math.atan(progress * 5);
    const noise = (this.rng() - 0.5) * 2;
    const btC = clamp(btBase + noise * 5, 160, 230);
    const etC = clamp(btC + 5 + this.rng() * 3, 160, 240);
    const rorCPerMin = clamp((btC - 160) / Math.max(1, this.elapsedSeconds + 1) * 60, 0, 25);

    const point: TelemetryPoint = {
      ts: new Date(Date.now()).toISOString(),
      machineId: this.cfg.machineId,
      elapsedSeconds: Number(this.elapsedSeconds.toFixed(2)),
      btC: Number(btC.toFixed(2)),
      etC: Number(etC.toFixed(2)),
      rorCPerMin: Number(rorCPerMin.toFixed(2))
    };

    this.elapsedSeconds += this.sampleIntervalSeconds;
    return point;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }
}
