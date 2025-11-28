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

  persistEnvelope(envelope: TelemetryEnvelope): TelemetryEnvelope {
    const withSession = this.deps.sessionizer.assignSession(envelope);
    const sessionSummary = this.buildSummary(withSession);
    this.deps.repo.upsertSession(sessionSummary);

    if (withSession.topic === "telemetry") {
      this.deps.repo.appendTelemetry(withSession.sessionId!, withSession.payload as TelemetryPoint);
      if (typeof (withSession.payload as TelemetryPoint).btC === "number") {
        this.deps.repo.upsertSession({
          ...sessionSummary,
          maxBtC: Math.max(sessionSummary.maxBtC ?? 0, (withSession.payload as TelemetryPoint).btC!)
        });
      }
    } else if (withSession.topic === "event") {
      const event = withSession.payload as RoastEvent;
      this.deps.repo.appendEvent(withSession.sessionId!, event);
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
      this.deps.repo.upsertSession(update);
      if (update.status === "CLOSED") {
        this.notifyClosedSession(update);
      }
      this.deps.sessionizer.handleEvent(withSession);
    }

    return withSession;
  }

  tick(nowIso: string): void {
    const closed = this.deps.sessionizer.tick(nowIso);
    closed.forEach((state) => {
      this.deps.repo.upsertSession({
        sessionId: state.sessionId,
        orgId: state.orgId,
        siteId: state.siteId,
        machineId: state.machineId,
        startedAt: state.startedAt,
        endedAt: state.lastSeenAt,
        status: "CLOSED",
        durationSeconds: (Date.parse(state.lastSeenAt) - Date.parse(state.startedAt)) / 1000
      });
      this.notifyClosedSession({
        sessionId: state.sessionId,
        orgId: state.orgId,
        siteId: state.siteId,
        machineId: state.machineId,
        startedAt: state.startedAt,
        endedAt: state.lastSeenAt,
        status: "CLOSED",
        durationSeconds: (Date.parse(state.lastSeenAt) - Date.parse(state.startedAt)) / 1000
      });
    });
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

  private notifyClosedSession(session: RoastSessionSummary): void {
    if (!this.deps.onSessionClosed) return;
    Promise.resolve(this.deps.onSessionClosed(session)).catch(() => {
      // swallow errors; hook errors should not disrupt ingestion
    });
  }
}
