import type { AgentTrace } from "@sim-corp/schemas";

export class TraceStore {
  private readonly traces = new Map<string, AgentTrace>();

  save(trace: AgentTrace): void {
    this.traces.set(trace.missionId, trace);
  }

  getByMissionId(missionId: string): AgentTrace | undefined {
    return this.traces.get(missionId);
  }

  list(limit?: number): AgentTrace[] {
    const values = Array.from(this.traces.values()).sort((a, b) =>
      (b.startedAt ?? "").localeCompare(a.startedAt ?? "")
    );
    if (typeof limit === "number" && limit >= 0) {
      return values.slice(0, limit);
    }
    return values;
  }
}
