export interface DriverMetrics {
  linesReceived: number;
  linesParsed: number;
  parseErrors: number;
  telemetryEmitted: number;
  reconnects: number;
  lastError?: string;
  lastLineAt?: string;
}

export interface DriverStatus {
  state: "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "STOPPED";
  metrics: DriverMetrics;
}
