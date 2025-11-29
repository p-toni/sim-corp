import net from "node:net";
import type { Driver, DriverConfig } from "@sim-corp/driver-core";
import type { TelemetryPoint } from "@sim-corp/schemas";
import { TcpLineDriverConfigSchema, type TcpLineDriverConfig } from "./config";
import { TcpLineParser, type RawTelemetrySample } from "./parser";
import { Backoff } from "./backoff";
import { type DriverMetrics, type DriverStatus } from "./metrics";

type DriverState = DriverStatus["state"];

export class TcpLineDriver implements Driver {
  private readonly debug = process.env.TCP_LINE_DEBUG === "1";
  private readonly config: TcpLineDriverConfig;
  private readonly parser: TcpLineParser;
  private readonly metrics: DriverMetrics = {
    linesReceived: 0,
    linesParsed: 0,
    parseErrors: 0,
    telemetryEmitted: 0,
    reconnects: 0
  };
  private state: DriverState = "DISCONNECTED";
  private socket: net.Socket | null = null;
  private buffer = "";
  private latestSample?: RawTelemetrySample;
  private startTs?: Date;
  private stopped = false;
  private readonly backoff: Backoff;
  private sampleWaiters: Array<{
    resolve: (sample: RawTelemetrySample) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
  }> = [];

  constructor(private readonly cfg: DriverConfig) {
    this.config = TcpLineDriverConfigSchema.parse({
      ...(cfg.connection ?? {})
    });
    this.parser = new TcpLineParser(this.config);
    this.backoff = new Backoff(this.config.reconnect.minBackoffMs, this.config.reconnect.maxBackoffMs);
  }

  async connect(): Promise<void> {
    this.stopped = false;
    this.startTs = undefined;
    await this.openSocketWithRetry();
  }

  async readTelemetry(): Promise<TelemetryPoint> {
    if (!this.latestSample) {
      await this.waitForSample();
    }
    if (!this.latestSample) {
      throw new Error("no telemetry yet");
    }
    const sample = this.latestSample;
    const baseTs = this.startTs ?? sample.ts;
    this.startTs = baseTs;
    const elapsedSeconds = Math.max(0, (sample.ts.getTime() - baseTs.getTime()) / 1000);
    this.metrics.telemetryEmitted += 1;
    return {
      ts: sample.ts.toISOString(),
      machineId: this.cfg.machineId,
      elapsedSeconds,
      btC: sample.btC,
      etC: sample.etC,
      gasPct: sample.powerPct,
      fanPct: sample.fanPct,
      drumRpm: sample.drumRpm,
      extras: sample.extras ?? {}
    };
  }

  async disconnect(): Promise<void> {
    this.stopped = true;
    this.state = "STOPPED";
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.rejectSampleWaiters(new Error("driver stopped"));
  }

  getStatus(): DriverStatus {
    return {
      state: this.state,
      metrics: { ...this.metrics }
    };
  }

  private async openSocketWithRetry(): Promise<void> {
    return await new Promise((resolve, reject) => {
      let resolved = false;
      const attempt = () => {
        if (this.stopped) return;
        if (this.debug) {
          // eslint-disable-next-line no-console
          console.log(`[tcp-line] connecting to ${this.config.host}:${this.config.port}`);
        }
        this.state = "CONNECTING";
        this.buffer = "";
        this.parser.resetCsvState();
        const socket = net.createConnection(this.config.port, this.config.host);
        socket.setKeepAlive(true);
        this.socket = socket;
        let failureHandled = false;

        const cleanup = () => {
          socket.removeAllListeners();
        };

        const handleFailure = (err: Error) => {
          if (failureHandled) return;
          failureHandled = true;
          if (this.debug) {
            // eslint-disable-next-line no-console
            console.log(`[tcp-line] connection failure: ${err.message}`);
          }
          this.metrics.lastError = err.message;
          this.state = this.stopped ? "STOPPED" : "DISCONNECTED";
          this.metrics.reconnects += this.state === "DISCONNECTED" ? 1 : 0;
          this.socket?.destroy();
          this.socket = null;
          this.buffer = "";
          this.startTs = undefined;
          this.parser.resetCsvState();
          this.rejectSampleWaiters(err);
          cleanup();
          if (this.stopped || !this.config.reconnect.enabled) {
            reject(err);
            return;
          }
          const delay = this.backoff.next();
          setTimeout(attempt, delay);
        };

        socket.once("connect", () => {
          this.state = "CONNECTED";
          this.backoff.reset();
          this.metrics.lastError = undefined;
          if (this.debug) {
            // eslint-disable-next-line no-console
            console.log(`[tcp-line] connected to ${this.config.host}:${this.config.port}`);
          }
          if (!resolved) {
            resolved = true;
            resolve();
          }
        });

        socket.on("data", (chunk: Buffer) => {
          this.handleData(chunk.toString("utf-8"));
        });

        socket.once("error", (err: Error) => handleFailure(err));
        socket.once("close", () => handleFailure(new Error("socket closed")));
        socket.once("end", () => handleFailure(new Error("socket ended")));
      };

      attempt();
    });
  }

  private handleData(text: string): void {
    this.buffer += text;
    let idx: number;
    while ((idx = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 1);
      this.metrics.linesReceived += 1;
      try {
        const sample = this.parser.parseLine(line);
        if (sample) {
          this.handleSample(sample);
        }
      } catch (err) {
        this.metrics.parseErrors += 1;
        this.metrics.lastError = err instanceof Error ? err.message : String(err);
      }
    }
  }

  private handleSample(sample: RawTelemetrySample): void {
    if (
      this.latestSample &&
      this.config.dedupeWithinMs > 0 &&
      sample.ts.getTime() - this.latestSample.ts.getTime() < this.config.dedupeWithinMs
    ) {
      return;
    }
    this.latestSample = sample;
    if (!this.startTs) {
      this.startTs = sample.ts;
    }
    this.metrics.linesParsed += 1;
    this.metrics.lastLineAt = sample.ts.toISOString();
    this.resolveSampleWaiters(sample);
  }

  private async waitForSample(): Promise<void> {
    const timeoutMs = Math.max(this.config.emitIntervalMs * 2, 500);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.sampleWaiters = this.sampleWaiters.filter((w) => w.timer !== timer);
        reject(new Error("no telemetry yet"));
      }, timeoutMs);
      this.sampleWaiters.push({
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (err: Error) => {
          clearTimeout(timer);
          reject(err);
        },
        timer
      });
    });
  }

  private resolveSampleWaiters(sample: RawTelemetrySample): void {
    if (this.sampleWaiters.length === 0) return;
    const waiters = [...this.sampleWaiters];
    this.sampleWaiters = [];
    waiters.forEach((waiter) => {
      clearTimeout(waiter.timer);
      waiter.resolve(sample);
    });
  }

  private rejectSampleWaiters(err: Error): void {
    if (this.sampleWaiters.length === 0) return;
    const waiters = [...this.sampleWaiters];
    this.sampleWaiters = [];
    waiters.forEach((waiter) => {
      clearTimeout(waiter.timer);
      waiter.reject(err);
    });
  }
}
