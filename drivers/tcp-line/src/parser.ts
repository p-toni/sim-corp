import type { TcpLineDriverConfig } from "./config";

export interface RawTelemetrySample {
  ts: Date;
  btC?: number;
  etC?: number;
  powerPct?: number;
  fanPct?: number;
  drumRpm?: number;
  extras?: Record<string, number | string>;
}

interface CsvState {
  headerParsed: boolean;
  columns: string[];
}

const DEFAULT_COLUMNS = ["ts", "btC", "etC", "powerPct", "fanPct", "drumRpm"];
const RESERVED_KEYS = new Set(["ts", "btC", "etC", "powerPct", "fanPct", "drumRpm"]);

export class TcpLineParser {
  private readonly csvState: CsvState = { headerParsed: false, columns: [] };

  constructor(private readonly config: TcpLineDriverConfig) {
    this.csvState.columns = [...config.csv.columns];
  }

  resetCsvState(): void {
    this.csvState.headerParsed = false;
    this.csvState.columns = [...this.config.csv.columns];
  }

  parseLine(line: string): RawTelemetrySample | null {
    const trimmed = line.trim();
    if (!trimmed) return null;
    if (this.config.format === "jsonl") {
      return this.parseJsonLine(trimmed);
    }
    return this.parseCsvLine(trimmed);
  }

  private parseJsonLine(line: string): RawTelemetrySample | null {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line) as Record<string, unknown>;
    } catch {
      throw new Error("invalid json");
    }
    return this.toSample(parsed);
  }

  private parseCsvLine(line: string): RawTelemetrySample | null {
    const parts = line.split(this.config.csv.delimiter);
    if (this.config.csv.hasHeader && !this.csvState.headerParsed) {
      this.csvState.columns = parts.map((p) => p.trim());
      this.csvState.headerParsed = true;
      return null;
    }

    const columns = this.csvState.columns.length > 0 ? this.csvState.columns : DEFAULT_COLUMNS;
    const record: Record<string, unknown> = {};
    parts.forEach((value, idx) => {
      const key = columns?.[idx];
      if (key) {
        record[key] = value.trim();
      }
    });
    return this.toSample(record);
  }

  private toSample(record: Record<string, unknown>): RawTelemetrySample | null {
    const tsValue = typeof record.ts === "string" ? new Date(record.ts) : new Date();
    if (Number.isNaN(tsValue.getTime())) {
      throw new Error("invalid timestamp");
    }

    const extras: Record<string, number | string> = {};
    const sample: RawTelemetrySample = {
      ts: tsValue
    };

    const bt = this.asNumber(record.btC);
    const et = this.asNumber(record.etC);
    const power = this.asNumber(record.powerPct);
    const fan = this.asNumber(record.fanPct);
    const rpm = this.asNumber(record.drumRpm);

    Object.entries(record).forEach(([key, value]) => {
      if (RESERVED_KEYS.has(key)) return;
      const num = this.asNumber(value);
      if (num !== undefined) {
        extras[key] = num;
      } else if (typeof value === "string" && value.trim().length > 0) {
        extras[key] = value.trim();
      }
    });

    if (bt !== undefined) sample.btC = bt + this.config.offsets.btC;
    if (et !== undefined) sample.etC = et + this.config.offsets.etC;
    if (power !== undefined) sample.powerPct = power;
    if (fan !== undefined) sample.fanPct = fan;
    if (rpm !== undefined) sample.drumRpm = rpm;
    if (Object.keys(extras).length > 0) {
      sample.extras = extras;
    }

    if (
      sample.btC === undefined &&
      sample.etC === undefined &&
      power === undefined &&
      fan === undefined &&
      rpm === undefined &&
      !sample.extras
    ) {
      return null;
    }

    return sample;
  }

  private asNumber(value: unknown): number | undefined {
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.length > 0) {
      const num = Number(value);
      return Number.isFinite(num) ? num : undefined;
    }
    return undefined;
  }
}
