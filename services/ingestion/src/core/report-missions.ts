import type { FastifyBaseLogger } from "fastify";
import type { RoastSessionSummary } from "@sim-corp/schemas";
import { IngestionRepository } from "../db/repo";

const DEFAULT_KERNEL_URL = "http://127.0.0.1:3000";

export class ReportMissionEnqueuer {
  constructor(
    private readonly deps: {
      repo: IngestionRepository;
      logger?: FastifyBaseLogger;
      kernelUrl?: string;
    }
  ) {}

  async handleSessionClosed(session: RoastSessionSummary): Promise<void> {
    if (!this.isEnabled()) return;
    try {
      const existing = this.deps.repo.getLatestSessionReport(session.sessionId);
      if (existing) {
        return;
      }
    } catch (err) {
      this.deps.logger?.warn({ err }, "report mission: failed to check existing report");
      return;
    }

    try {
      const response = await fetch(this.buildKernelUrl("/missions"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          goal: "generate-roast-report",
          params: { sessionId: session.sessionId },
          context: {
            orgId: session.orgId,
            siteId: session.siteId,
            machineId: session.machineId
          }
        })
      });
      if (!response.ok) {
        const message = await response.text();
        this.deps.logger?.warn(
          { status: response.status, message },
          "report mission: kernel enqueue failed"
        );
      }
    } catch (err) {
      this.deps.logger?.warn({ err }, "report mission: kernel unreachable");
    }
  }

  private isEnabled(): boolean {
    const flag = process.env.AUTO_REPORT_MISSIONS_ENABLED ?? "false";
    return flag.toLowerCase() === "true";
  }

  private buildKernelUrl(pathname: string): string {
    const base = this.deps.kernelUrl ?? process.env.INGESTION_KERNEL_URL ?? DEFAULT_KERNEL_URL;
    const url = new URL(pathname, base);
    return url.toString();
  }
}
