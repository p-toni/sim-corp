import type { FastifyBaseLogger } from "fastify";
import {
  SessionClosedEventSchema,
  type RoastSessionSummary,
  type SessionClosedEvent
} from "@sim-corp/schemas";
import { DEFAULT_REPORT_KIND, IngestionRepository } from "../db/repo";
import type { OpsEventPublisher } from "../ops/publisher";

const DEFAULT_KERNEL_URL = "http://127.0.0.1:3000";

export class ReportMissionEnqueuer {
  private readonly warnedSessions = new Set<string>();
  private readonly publishWarnedSessions = new Set<string>();

  constructor(
    private readonly deps: {
      repo: IngestionRepository;
      logger?: FastifyBaseLogger;
      kernelUrl?: string;
      opsPublisher?: OpsEventPublisher | null;
    }
  ) {}

  async handleSessionClosed(session: RoastSessionSummary): Promise<void> {
    if (!this.shouldHandle()) return;

    const hasReport = await this.hasExistingReport(session.sessionId);
    if (hasReport) {
      return;
    }

    const signals = this.buildSessionSignals(session);
    const opsEnabled = this.isOpsEventsEnabled();
    if (opsEnabled) {
      await this.tryPublishOpsEvent(session, signals);
    }

    if (this.shouldEnqueueDirect(opsEnabled)) {
      await this.enqueueMission(session, signals);
    }
  }

  private async hasExistingReport(sessionId: string): Promise<boolean> {
    try {
      const existing = this.deps.repo.getLatestSessionReport(sessionId, DEFAULT_REPORT_KIND);
      return Boolean(existing);
    } catch (err) {
      this.deps.logger?.warn({ err }, "report mission: failed to check existing report");
      return true;
    }
  }

  private shouldHandle(): boolean {
    return this.isAutoReportEnabled() || this.isOpsEventsEnabled();
  }

  private isAutoReportEnabled(): boolean {
    const flag = process.env.AUTO_REPORT_MISSIONS_ENABLED ?? "false";
    return flag.toLowerCase() === "true";
  }

  private isOpsEventsEnabled(): boolean {
    const flag = process.env.INGESTION_OPS_EVENTS_ENABLED ?? "false";
    return flag.toLowerCase() === "true";
  }

  private isFallbackEnabled(): boolean {
    const flag = process.env.INGESTION_KERNEL_ENQUEUE_FALLBACK_ENABLED ?? "true";
    return flag.toLowerCase() === "true";
  }

  private shouldEnqueueDirect(opsEnabled: boolean): boolean {
    if (this.isFallbackEnabled()) {
      return true;
    }
    if (!opsEnabled && this.isAutoReportEnabled()) {
      return true;
    }
    return false;
  }

  private async tryPublishOpsEvent(session: RoastSessionSummary, signals: ReturnType<ReportMissionEnqueuer["buildSessionSignals"]>): Promise<boolean> {
    if (!this.deps.opsPublisher) return false;
    const event = this.buildSessionClosedEvent(session, signals);
    try {
      await this.deps.opsPublisher.publishSessionClosed(event);
      this.publishWarnedSessions.delete(session.sessionId);
      return true;
    } catch (err) {
      this.warnPublishOnce(session.sessionId, { err }, "report mission: failed to publish session.closed");
      return false;
    }
  }

  private buildSessionClosedEvent(
    session: RoastSessionSummary,
    signals: ReturnType<ReportMissionEnqueuer["buildSessionSignals"]>
  ): SessionClosedEvent {
    const sessionSignals = signals.session ?? {};
    return SessionClosedEventSchema.parse({
      type: "session.closed",
      version: 1,
      emittedAt: new Date().toISOString(),
      orgId: session.orgId,
      siteId: session.siteId,
      machineId: session.machineId,
      sessionId: session.sessionId,
      reportKind: DEFAULT_REPORT_KIND,
      dropSeconds: session.dropSeconds,
      reason: session.dropSeconds ? "DROP" : "SILENCE_CLOSE",
      telemetryPoints: sessionSignals.telemetryPoints,
      durationSec: sessionSignals.durationSec,
      hasBT: sessionSignals.hasBT,
      hasET: sessionSignals.hasET,
      lastTelemetryDeltaSec: sessionSignals.lastTelemetryDeltaSec
    });
  }

  private async enqueueMission(
    session: RoastSessionSummary,
    signals: ReturnType<ReportMissionEnqueuer["buildSessionSignals"]>
  ): Promise<void> {
    try {
      const response = await fetch(this.buildKernelUrl("/missions"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          goal: "generate-roast-report",
          idempotencyKey: this.buildIdempotencyKey(session.sessionId),
          params: { sessionId: session.sessionId, reportKind: DEFAULT_REPORT_KIND },
          subjectId: session.sessionId,
          context: {
            orgId: session.orgId,
            siteId: session.siteId,
            machineId: session.machineId
          },
          signals
        })
      });
      if (!response.ok) {
        const message = await response.text();
        this.warnOnce(session.sessionId, { status: response.status, message }, "report mission: kernel enqueue failed");
      } else {
        this.warnedSessions.delete(session.sessionId);
      }
    } catch (err) {
      this.warnOnce(session.sessionId, { err }, "report mission: kernel unreachable");
    }
  }

  private buildKernelUrl(pathname: string): string {
    const base = this.deps.kernelUrl ?? process.env.INGESTION_KERNEL_URL ?? DEFAULT_KERNEL_URL;
    const url = new URL(pathname, base);
    return url.toString();
  }

  private buildIdempotencyKey(sessionId: string): string {
    return `generate-roast-report:${DEFAULT_REPORT_KIND}:${sessionId}`;
  }

  private warnOnce(sessionId: string, meta: Record<string, unknown>, message: string): void {
    if (this.warnedSessions.has(sessionId)) return;
    this.warnedSessions.add(sessionId);
    this.deps.logger?.warn(meta, message);
  }

  private warnPublishOnce(sessionId: string, meta: Record<string, unknown>, message: string): void {
    if (this.publishWarnedSessions.has(sessionId)) return;
    this.publishWarnedSessions.add(sessionId);
    this.deps.logger?.warn(meta, message);
  }

  private buildSessionSignals(session: RoastSessionSummary) {
    const stats = this.deps.repo.getTelemetryStats(session.sessionId);
    const durationSec = session.durationSeconds ?? session.dropSeconds ?? stats.lastElapsedSeconds ?? undefined;
    const lastTelemetryDeltaSec =
      typeof stats.lastElapsedSeconds === "number" && typeof durationSec === "number"
        ? Math.max(0, durationSec - stats.lastElapsedSeconds)
        : undefined;
    return {
      session: {
        sessionId: session.sessionId,
        closeReason: session.dropSeconds ? "DROP" : "SILENCE_CLOSE",
        durationSec,
        telemetryPoints: stats.count,
        hasBT: stats.hasBT,
        hasET: stats.hasET,
        lastTelemetryDeltaSec
      }
    };
  }
}
