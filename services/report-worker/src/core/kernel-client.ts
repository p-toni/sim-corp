import { AgentTraceSchema, MissionSchema, type AgentTrace, type Mission } from "@sim-corp/schemas";
import { z } from "zod";

const ClaimRequestSchema = z.object({
  agentName: z.string(),
  goals: z.array(z.string()).optional()
});

const MissionRecordSchema = MissionSchema.extend({
  status: z.enum(["PENDING", "RUNNING", "DONE", "FAILED"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  attempts: z.number(),
  maxAttempts: z.number(),
  nextRetryAt: z.string().optional(),
  leaseId: z.string().optional(),
  leaseExpiresAt: z.string().optional(),
  lastHeartbeatAt: z.string().optional(),
  claimedBy: z.string().optional(),
  claimedAt: z.string().optional(),
  resultMeta: z.record(z.unknown()).optional(),
  errorMeta: z.object({ error: z.string(), details: z.record(z.unknown()).optional() }).optional(),
  idempotencyKey: z.string().optional()
});

export type MissionRecord = z.infer<typeof MissionRecordSchema>;

export interface KernelClientOptions {
  baseUrl?: string;
}

export class KernelClient {
  private readonly baseUrl: string;

  constructor(options: KernelClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? process.env.KERNEL_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
  }

  async claimMission(agentName: string, goals?: string[]): Promise<MissionRecord | null> {
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
    return MissionRecordSchema.parse(json);
  }

  async completeMission(id: string, summary?: Record<string, unknown>, leaseId?: string): Promise<void> {
    await this.postJson(`${this.baseUrl}/missions/${id}/complete`, { summary, leaseId });
  }

  async failMission(
    id: string,
    error: string,
    options: { details?: Record<string, unknown>; retryable?: boolean; leaseId?: string } = {}
  ): Promise<void> {
    await this.postJson(`${this.baseUrl}/missions/${id}/fail`, {
      error,
      details: options.details,
      retryable: options.retryable,
      leaseId: options.leaseId
    });
  }

  async heartbeatMission(id: string, leaseId: string, agentName?: string): Promise<void> {
    await this.postJson(`${this.baseUrl}/missions/${id}/heartbeat`, { leaseId, agentName });
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
