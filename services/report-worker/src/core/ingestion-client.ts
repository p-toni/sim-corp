import { RoastReportSchema, type RoastReport } from "@sim-corp/schemas";

const DEFAULT_INGESTION_URL = "http://127.0.0.1:4001";

export interface IngestionClientOptions {
  baseUrl?: string;
}

export class IngestionClient {
  private readonly baseUrl: string;

  constructor(options: IngestionClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? process.env.INGESTION_URL ?? DEFAULT_INGESTION_URL).replace(/\/$/, "");
  }

  async getLatestReport(sessionId: string): Promise<RoastReport | null> {
    const res = await fetch(`${this.baseUrl}/sessions/${sessionId}/reports/latest`);
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      const message = await res.text();
      throw new Error(`ingestion fetch failed ${res.status}: ${message || "unknown error"}`);
    }
    const json = await res.json();
    return RoastReportSchema.parse(json);
  }
}
