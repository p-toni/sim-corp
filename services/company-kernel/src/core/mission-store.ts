import { MissionSchema, type Mission } from "@sim-corp/schemas";

export type MissionStatus = "PENDING" | "RUNNING" | "DONE" | "FAILED";

export interface MissionRecord extends Mission {
  missionId: string;
  status: MissionStatus;
  createdAt: string;
  updatedAt: string;
  claimedBy?: string;
  claimedAt?: string;
  resultMeta?: Record<string, unknown>;
  errorMeta?: { error: string; details?: Record<string, unknown> };
}

interface MissionFilters {
  status?: MissionStatus;
  goal?: string;
  agent?: string;
  sessionId?: string;
}

export class MissionStore {
  private missions: MissionRecord[] = [];

  createMission(mission: Mission): MissionRecord {
    const normalizedGoal = this.normalizeGoal(mission.goal);
    const parsed = MissionSchema.parse({
      ...mission,
      missionId: mission.missionId ?? mission.id,
      goal: normalizedGoal
    });
    const missionId = parsed.missionId ?? parsed.id ?? this.generateMissionId();
    const now = new Date().toISOString();
    const record: MissionRecord = {
      ...parsed,
      missionId,
      id: parsed.id ?? missionId,
      status: "PENDING",
      createdAt: parsed.createdAt ?? now,
      updatedAt: now
    };
    this.missions.push(record);
    return { ...record };
  }

  listMissions(filter: MissionFilters = {}): MissionRecord[] {
    return this.missions
      .filter((mission) => {
        if (filter.status && mission.status !== filter.status) return false;
        if (filter.goal && this.goalName(mission) !== filter.goal) return false;
        if (filter.agent && mission.claimedBy !== filter.agent) return false;
        if (filter.sessionId && (mission.params as { sessionId?: string })?.sessionId !== filter.sessionId) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  claimNext(agentName: string, goals?: string[]): MissionRecord | null {
    const goalSet = goals && goals.length ? new Set(goals) : null;
    const next = this.missions.find((mission) => {
      if (mission.status !== "PENDING") return false;
      if (goalSet && !goalSet.has(this.goalName(mission))) return false;
      return true;
    });
    if (!next) return null;
    const now = new Date().toISOString();
    next.status = "RUNNING";
    next.claimedBy = agentName;
    next.claimedAt = now;
    next.updatedAt = now;
    return { ...next };
  }

  completeMission(id: string, resultMeta?: Record<string, unknown>): MissionRecord {
    const mission = this.ensureMission(id);
    mission.status = "DONE";
    mission.resultMeta = resultMeta;
    mission.updatedAt = new Date().toISOString();
    return { ...mission };
  }

  failMission(
    id: string,
    error: { error: string; details?: Record<string, unknown> }
  ): MissionRecord {
    const mission = this.ensureMission(id);
    mission.status = "FAILED";
    mission.errorMeta = error;
    mission.updatedAt = new Date().toISOString();
    return { ...mission };
  }

  getMission(id: string): MissionRecord | null {
    return this.missions.find((m) => m.missionId === id || m.id === id) ?? null;
  }

  private ensureMission(id: string): MissionRecord {
    const mission = this.getMission(id);
    if (!mission) {
      throw new Error("Mission not found");
    }
    return mission;
  }

  private goalName(mission: Mission): string {
    const goal = mission.goal as string | { title?: string };
    if (typeof goal === "string") return goal;
    return goal?.title ?? "unknown";
  }

  private normalizeGoal(goal: Mission["goal"]): Mission["goal"] {
    if (typeof goal === "string") {
      return { title: goal };
    }
    if (goal && typeof goal === "object" && "title" in goal) {
      return goal;
    }
    throw new Error("Invalid mission goal");
  }

  private generateMissionId(): string {
    const rand = Math.random().toString(36).slice(2, 8);
    const ts = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
    return `M-${ts}-${rand}`;
  }
}
