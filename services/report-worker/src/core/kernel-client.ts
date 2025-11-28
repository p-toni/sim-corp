import { AgentTraceSchema, MissionSchema, type AgentTrace, type Mission } from "@sim-corp/schemas";
import { z } from "zod";

const ClaimRequestSchema = z.object({
  agentName: z.string(),
  goals: z.array(z.string()).optional()
});

export interface KernelClientOptions {
  baseUrl?: string;
}

export class KernelClient {
  private readonly baseUrl: string;

  constructor(options: KernelClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? process.env.KERNEL_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
  }

  async claimMission(agentName: string, goals?: string[]): Promise<Mission | null> {
    const payload = ClaimRequestSchema.parse({ agentName, goals });
    const res = await fetch(`${this.baseUrl}/missions/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (res.status === 204) {
      return null;
    }
    if (!res.ok) {
      const message = await res.text();
      throw new Error(`Kernel claim failed ${res.status}: ${message}`);
    }

    const json = await res.json();
    return MissionSchema.parse(json);
  }

  async completeMission(id: string, summary?: Record<string, unknown>): Promise<void> {
    await this.postJson(`${this.baseUrl}/missions/${id}/complete`, { summary });
  }

  async failMission(id: string, error: string, details?: Record<string, unknown>): Promise<void> {
    await this.postJson(`${this.baseUrl}/missions/${id}/fail`, { error, details });
  }

  async submitTrace(trace: AgentTrace): Promise<void> {
    const parsed = AgentTraceSchema.parse(trace);
    await this.postJson(`${this.baseUrl}/traces`, parsed);
  }

  private async postJson(url: string, body: unknown): Promise<void> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const message = await res.text();
      throw new Error(`Kernel request failed ${res.status}: ${message || "unknown error"}`);
    }
  }
}
