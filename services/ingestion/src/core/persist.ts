import type {
  RoastEvent,
  RoastSessionSummary,
  TelemetryEnvelope,
  TelemetryPoint
} from "@sim-corp/schemas";
import { IngestionRepository } from "../db/repo";
import type { Sessionizer } from "./sessionizer";

interface PersistDeps {
  repo: IngestionRepository;
  sessionizer: Sessionizer;
  onSessionClosed?: (session: RoastSessionSummary) => void | Promise<void>;
}

export class PersistencePipeline {
  constructor(private readonly deps: PersistDeps) {}

  async persistEnvelope(envelope: TelemetryEnvelope): Promise<TelemetryEnvelope> {
    const withSession = this.deps.sessionizer.assignSession(envelope);
    const sessionSummary = this.buildSummary(withSession);
    await this.deps.repo.upsertSession(sessionSummary);

    if (withSession.topic === "telemetry") {
      await this.deps.repo.appendTelemetry(withSession.sessionId!, withSession.payload as TelemetryPoint);

      // Update trust metrics for telemetry
      const currentSession = await this.deps.repo.getSession(withSession.sessionId!);
      const telemetryPoints = (currentSession?.telemetryPoints ?? 0) + 1;
      const verified = withSession._verification?.verified === true;
      const unsigned = !withSession.sig && !withSession.kid;
      const failed = !verified && !unsigned;

      const verifiedPoints = (currentSession?.verifiedPoints ?? 0) + (verified ? 1 : 0);
      const unsignedPoints = (currentSession?.unsignedPoints ?? 0) + (unsigned ? 1 : 0);
      const failedPoints = (currentSession?.failedPoints ?? 0) + (failed ? 1 : 0);

      const deviceIds = currentSession?.deviceIds ?? [];
      if (withSession.kid && !deviceIds.includes(withSession.kid)) {
        deviceIds.push(withSession.kid);
      }

      const trustUpdate = {
        ...sessionSummary,
        telemetryPoints,
        verifiedPoints,
        unsignedPoints,
        failedPoints,
        deviceIds
      };

      if (typeof (withSession.payload as TelemetryPoint).btC === "number") {
        trustUpdate.maxBtC = Math.max(sessionSummary.maxBtC ?? 0, (withSession.payload as TelemetryPoint).btC!);
      }

      await this.deps.repo.upsertSession(trustUpdate);
    } else if (withSession.topic === "event") {
      const event = withSession.payload as RoastEvent;
      await this.deps.repo.appendEvent(withSession.sessionId!, event);
      const update = { ...sessionSummary };
      if (event.type === "FC" && typeof event.payload?.elapsedSeconds === "number") {
        update.fcSeconds = event.payload.elapsedSeconds;
      }
      if (event.type === "DROP") {
        update.dropSeconds = event.payload?.elapsedSeconds;
        update.endedAt = event.ts;
        update.status = "CLOSED";
        if (typeof event.payload?.elapsedSeconds === "number") {
          update.durationSeconds = event.payload.elapsedSeconds;
        }
      }
      await this.deps.repo.upsertSession(update);
      if (update.status === "CLOSED") {
        await this.notifyClosedSession(update);
      }
      this.deps.sessionizer.handleEvent(withSession);
    }

    return withSession;
  }

  async tick(nowIso: string): Promise<void> {
    const closed = this.deps.sessionizer.tick(nowIso);
    for (const state of closed) {
      await this.deps.repo.upsertSession({
        sessionId: state.sessionId,
        orgId: state.orgId,
        siteId: state.siteId,
        machineId: state.machineId,
        startedAt: state.startedAt,
        endedAt: state.lastSeenAt,
        status: "CLOSED",
        durationSeconds: (Date.parse(state.lastSeenAt) - Date.parse(state.startedAt)) / 1000
      });
      await this.notifyClosedSession({
        sessionId: state.sessionId,
        orgId: state.orgId,
        siteId: state.siteId,
        machineId: state.machineId,
        startedAt: state.lastSeenAt,
        endedAt: state.lastSeenAt,
        status: "CLOSED",
        durationSeconds: (Date.parse(state.lastSeenAt) - Date.parse(state.startedAt)) / 1000
      });
    }
  }

  private buildSummary(envelope: TelemetryEnvelope) {
    return {
      sessionId: envelope.sessionId ?? "unknown",
      orgId: envelope.origin.orgId,
      siteId: envelope.origin.siteId,
      machineId: envelope.origin.machineId,
      startedAt: envelope.ts,
      endedAt: null,
      status: "ACTIVE" as const
    };
  }

  private async notifyClosedSession(session: RoastSessionSummary): Promise<void> {
    if (!this.deps.onSessionClosed) return;
    try {
      await Promise.resolve(this.deps.onSessionClosed(session));
    } catch {
      // swallow errors; hook errors should not disrupt ingestion
    }
  }
}
