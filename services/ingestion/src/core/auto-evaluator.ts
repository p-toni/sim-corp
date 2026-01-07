import type { RoastSessionSummary, RoastAnalysis } from "@sim-corp/schemas";
import type { EvalServiceClient } from "./eval-client";
import type { Logger } from "fastify";

export interface AutoEvaluatorConfig {
  enabled: boolean;
  analyticsUrl: string;
  commandServiceUrl?: string;
}

/**
 * Automatically evaluates sessions against golden cases when they close
 */
export class AutoEvaluator {
  constructor(
    private readonly evalClient: EvalServiceClient | null,
    private readonly config: AutoEvaluatorConfig,
    private readonly logger?: Logger
  ) {}

  /**
   * Handle session closed event
   */
  async handleSessionClosed(session: RoastSessionSummary): Promise<void> {
    if (!this.config.enabled || !this.evalClient) {
      return;
    }

    try {
      this.logger?.info({ sessionId: session.sessionId }, "Auto-evaluating session");

      // Fetch analysis from analytics service
      const analysis = await this.fetchAnalysis(session.sessionId);
      if (!analysis) {
        this.logger?.warn({ sessionId: session.sessionId }, "No analysis found, skipping evaluation");
        return;
      }

      // Fetch command data from command service
      const commands = await this.fetchCommands(session.sessionId);

      // Find matching golden cases
      const batchSizeKg = undefined; // TODO: Extract from session metadata
      const goldenCases = await this.evalClient.findMatchingGoldenCases(session.machineId, batchSizeKg);

      if (goldenCases.length === 0) {
        this.logger?.info({ sessionId: session.sessionId, machineId: session.machineId }, "No matching golden cases found");
        return;
      }

      this.logger?.info(
        { sessionId: session.sessionId, goldenCaseCount: goldenCases.length },
        "Found matching golden cases"
      );

      // Run evaluation for each golden case
      const results = await Promise.allSettled(
        goldenCases.map((goldenCase) =>
          this.evalClient!.runEvaluation({
            sessionId: session.sessionId,
            goldenCaseId: goldenCase.id,
            analysis,
            commands,
            orgId: session.orgId,
            evaluatorId: "auto-evaluator"
          })
        )
      );

      // Log results
      const successful = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;

      this.logger?.info(
        { sessionId: session.sessionId, successful, failed },
        "Auto-evaluation completed"
      );

      // Log individual results
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          const evalRun = result.value;
          this.logger?.info(
            {
              sessionId: session.sessionId,
              goldenCaseId: goldenCases[index].id,
              outcome: evalRun.outcome,
              passedGates: evalRun.passedGates,
              failedGates: evalRun.failedGates
            },
            "Evaluation result"
          );
        } else {
          this.logger?.error(
            { sessionId: session.sessionId, goldenCaseId: goldenCases[index].id, error: result.reason },
            "Evaluation failed"
          );
        }
      });
    } catch (error) {
      this.logger?.error({ sessionId: session.sessionId, error }, "Auto-evaluation error");
    }
  }

  /**
   * Fetch analysis from analytics service
   */
  private async fetchAnalysis(sessionId: string): Promise<RoastAnalysis | null> {
    try {
      const url = `${this.config.analyticsUrl}/analysis/session/${encodeURIComponent(sessionId)}`;
      const response = await fetch(url);

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`Analytics service returned ${response.status}`);
      }

      return response.json() as Promise<RoastAnalysis>;
    } catch (error) {
      this.logger?.error({ sessionId, error }, "Failed to fetch analysis");
      return null;
    }
  }

  /**
   * Fetch commands from command service for a session
   */
  private async fetchCommands(sessionId: string): Promise<Array<{
    proposalId: string;
    commandType: string;
    targetValue?: number;
    proposedAt: string;
    approvedAt?: string;
    executedAt?: string;
    status: string;
    reasoning?: string;
    outcome?: string;
  }>> {
    if (!this.config.commandServiceUrl) {
      return []; // No command service configured
    }

    try {
      const url = `${this.config.commandServiceUrl}/proposals?sessionId=${encodeURIComponent(sessionId)}`;
      const response = await fetch(url);

      if (response.status === 404) {
        return [];
      }

      if (!response.ok) {
        this.logger?.warn({ sessionId, status: response.status }, "Failed to fetch commands");
        return [];
      }

      const data = await response.json();
      const proposals = data.items || [];

      return proposals.map((p: any) => ({
        proposalId: p.proposalId,
        commandType: p.commandType,
        targetValue: p.targetValue,
        proposedAt: p.proposedAt,
        approvedAt: p.approvedAt,
        executedAt: p.executedAt,
        status: p.status,
        reasoning: p.reasoning,
        outcome: p.executionStatus
      }));
    } catch (error) {
      this.logger?.error({ sessionId, error }, "Failed to fetch commands");
      return [];
    }
  }
}
