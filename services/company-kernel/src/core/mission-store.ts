import type { GovernanceDecision, Mission } from "@sim-corp/schemas";
import { MissionRepository, type MissionCreateInput, type MissionRecord, type MissionStatus } from "../db/repo";

export type { MissionStatus };
interface MissionFilters {
  status?: MissionStatus;
  goal?: string;
  agent?: string;
  sessionId?: string;
  subjectId?: string;
}

interface MissionStoreOptions {
  leaseDurationMs?: number;
  baseBackoffMs?: number;
}

interface MissionCreateResult {
  mission: MissionRecord;
  created: boolean;
}

const DEFAULT_LEASE_MS = 30_000;
const DEFAULT_BACKOFF_MS = 2_000;

export class MissionStore {
  private readonly leaseDurationMs: number;
  private readonly backoffMs: number;
  private readonly repo: MissionRepository;

  constructor(repo: MissionRepository, options: MissionStoreOptions = {}) {
    this.repo = repo;
    this.leaseDurationMs = options.leaseDurationMs ?? DEFAULT_LEASE_MS;
    this.backoffMs = options.baseBackoffMs ?? DEFAULT_BACKOFF_MS;
  }

  createMission(mission: MissionCreateInput): MissionCreateResult {
    return this.repo.createMission(mission);
  }

  listMissions(filter: MissionFilters = {}): MissionRecord[] {
    const missions = this.repo.listMissions({
      status: filter.status,
      goal: filter.goal,
      agent: filter.agent,
      subjectId: filter.subjectId,
      limit: 100,
      offset: 0
    });
    if (filter.sessionId) {
      return missions.filter(
        (m) =>
          m.subjectId === filter.sessionId ||
          (m.params as { sessionId?: string } | undefined)?.sessionId === filter.sessionId
      );
    }
    return missions;
  }

  claimNext(agentName: string, goals?: string[], now: Date = new Date()): MissionRecord | null {
    return this.repo.claimNext({
      agentName,
      goals,
      nowIso: now.toISOString(),
      leaseDurationMs: this.leaseDurationMs
    });
  }

  heartbeatMission(id: string, leaseId: string, agentName?: string): MissionRecord {
    const mission = this.repo.getMission(id);
    if (!mission) throw new Error("Mission not found");
    if (mission.claimedBy && agentName && mission.claimedBy !== agentName) {
      throw new Error("Mission claimed by another agent");
    }
    return this.repo.heartbeat(id, leaseId, new Date().toISOString());
  }

  completeMission(id: string, resultMeta?: Record<string, unknown>, leaseId?: string): MissionRecord {
    return this.repo.completeMission(id, resultMeta, leaseId);
  }

  failMission(
    id: string,
    error: { error: string; details?: Record<string, unknown> },
    options: { retryable?: boolean; leaseId?: string } = {}
  ): MissionRecord {
    return this.repo.failMission({
      missionId: id,
      retryable: Boolean(options.retryable),
      error,
      nowIso: new Date().toISOString(),
      leaseId: options.leaseId,
      backoffMs: this.backoffMs
    });
  }

  getMission(id: string): MissionRecord | null {
    return this.repo.getMission(id);
  }

  approveMission(id: string, decision: GovernanceDecision): MissionRecord {
    return this.repo.approveMission(id, decision, new Date().toISOString());
  }

  cancelMission(id: string): MissionRecord {
    return this.repo.cancelMission(id, new Date().toISOString());
  }

  metrics(): ReturnType<MissionRepository["metrics"]> {
    return this.repo.metrics();
  }
}
