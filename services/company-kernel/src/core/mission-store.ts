import type { Actor, GovernanceDecision, Mission } from "@sim-corp/schemas";
import { MissionRepository, type MissionCreateInput, type MissionRecord, type MissionStatus } from "../db/repo";

export type { MissionStatus };
interface MissionFilters {
  status?: MissionStatus | MissionStatus[];
  goal?: string;
  agent?: string;
  sessionId?: string;
  subjectId?: string;
  orgId?: string;
  siteId?: string;
  machineId?: string;
  limit?: number;
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

  async createMission(mission: MissionCreateInput, actor?: Actor): Promise<MissionCreateResult> {
    return this.repo.createMission(mission, actor);
  }

  async listMissions(filter: MissionFilters = {}): Promise<{ items: MissionRecord[] }> {
    const missions = await this.repo.listMissions({
      statuses: Array.isArray(filter.status) ? filter.status : filter.status ? [filter.status] : undefined,
      goal: filter.goal,
      agent: filter.agent,
      subjectId: filter.subjectId,
      orgId: filter.orgId,
      siteId: filter.siteId,
      machineId: filter.machineId,
      limit: filter.limit ?? 50,
      offset: 0
    });
    if (filter.sessionId) {
      return {
        items: missions.filter(
          (m) =>
            m.subjectId === filter.sessionId ||
            (m.params as { sessionId?: string } | undefined)?.sessionId === filter.sessionId
        )
      };
    }
    return { items: missions };
  }

  async claimNext(agentName: string, goals?: string[], now: Date = new Date()): Promise<MissionRecord | null> {
    return this.repo.claimNext({
      agentName,
      goals,
      nowIso: now.toISOString(),
      leaseDurationMs: this.leaseDurationMs
    });
  }

  async heartbeatMission(id: string, leaseId: string, agentName?: string): Promise<MissionRecord> {
    const mission = await this.repo.getMission(id);
    if (!mission) throw new Error("Mission not found");
    if (mission.claimedBy && agentName && mission.claimedBy !== agentName) {
      throw new Error("Mission claimed by another agent");
    }
    return this.repo.heartbeat(id, leaseId, new Date().toISOString());
  }

  async completeMission(id: string, resultMeta?: Record<string, unknown>, leaseId?: string): Promise<MissionRecord> {
    return this.repo.completeMission(id, resultMeta, leaseId);
  }

  async failMission(
    id: string,
    error: { error: string; details?: Record<string, unknown> },
    options: { retryable?: boolean; leaseId?: string } = {}
  ): Promise<MissionRecord> {
    return this.repo.failMission({
      missionId: id,
      retryable: Boolean(options.retryable),
      error,
      nowIso: new Date().toISOString(),
      leaseId: options.leaseId,
      backoffMs: this.backoffMs
    });
  }

  async getMission(id: string): Promise<MissionRecord | null> {
    return this.repo.getMission(id);
  }

  async approveMission(id: string, decision: GovernanceDecision, actor?: Actor): Promise<MissionRecord> {
    return this.repo.approveMission(id, decision, new Date().toISOString(), actor);
  }

  async cancelMission(id: string, actor?: Actor): Promise<MissionRecord> {
    return this.repo.cancelMission(id, new Date().toISOString(), actor);
  }

  async retryNowMission(id: string, actor?: Actor): Promise<MissionRecord> {
    return this.repo.retryNowMission(id, new Date().toISOString(), actor);
  }

  async metrics(): Promise<ReturnType<MissionRepository["metrics"]>> {
    return this.repo.metrics();
  }
}
