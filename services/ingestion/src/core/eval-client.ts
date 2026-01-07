import type { GoldenCase, EvalRun, RoastAnalysis } from "@sim-corp/schemas";

export interface EvalServiceConfig {
  baseUrl: string;
}

/**
 * Client for interacting with the eval service
 */
export class EvalServiceClient {
  constructor(private readonly config: EvalServiceConfig) {}

  /**
   * Find matching golden cases for a session
   */
  async findMatchingGoldenCases(machineId: string, batchSizeKg?: number): Promise<GoldenCase[]> {
    const url = `${this.config.baseUrl}/golden-cases?machineId=${encodeURIComponent(machineId)}&archived=false`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch golden cases: ${response.status}`);
    }

    const cases = await response.json() as GoldenCase[];

    // Filter by batch size if provided (within 20% tolerance)
    if (batchSizeKg !== undefined) {
      return cases.filter((c) => {
        if (!c.batchSizeKg) return true; // Include cases without batch size constraint
        const tolerance = c.batchSizeKg * 0.2;
        return Math.abs(c.batchSizeKg - batchSizeKg) <= tolerance;
      });
    }

    return cases;
  }

  /**
   * Run evaluation for a session
   */
  async runEvaluation(input: {
    sessionId: string;
    goldenCaseId: string;
    analysis: RoastAnalysis;
    commands?: Array<{
      proposalId: string;
      commandType: string;
      targetValue?: number;
      proposedAt: string;
      approvedAt?: string;
      executedAt?: string;
      status: string;
      reasoning?: string;
      outcome?: string;
    }>;
    orgId?: string;
    evaluatorId?: string;
  }): Promise<EvalRun> {
    const url = `${this.config.baseUrl}/evaluations/run`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to run evaluation: ${response.status} ${error}`);
    }

    return response.json() as Promise<EvalRun>;
  }

  /**
   * Check if a session can be promoted
   */
  async canPromote(sessionId: string): Promise<{ allowed: boolean; reason?: string }> {
    const url = `${this.config.baseUrl}/evaluations/promotion/${encodeURIComponent(sessionId)}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to check promotion: ${response.status}`);
    }

    return response.json();
  }
}
