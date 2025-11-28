import type { AgentTrace, Mission } from "@sim-corp/schemas";
import { runRoastReportMission, type ReportToolsConfig } from "@sim-corp/roast-report-agent";

export interface ReportRunner {
  run(mission: Mission): Promise<AgentTrace>;
}

export class RoastReportRunner implements ReportRunner {
  constructor(private readonly toolsConfig: ReportToolsConfig = {}) {}

  async run(mission: Mission): Promise<AgentTrace> {
    return runRoastReportMission(mission, this.toolsConfig);
  }
}
