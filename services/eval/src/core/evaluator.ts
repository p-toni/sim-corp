import type { GoldenCase, DetailedEvalMetrics, EvalOutcome } from "@sim-corp/schemas";

export interface EvaluationResult {
  outcome: EvalOutcome;
  passedGates: string[];
  failedGates: string[];
  warnings: string[];
}

export class Evaluator {
  evaluate(goldenCase: GoldenCase, metrics: DetailedEvalMetrics): EvaluationResult {
    const passedGates: string[] = [];
    const failedGates: string[] = [];
    const warnings: string[] = [];

    // Check timing errors
    if (goldenCase.fcSecondsErrorTolerance !== undefined && metrics.fcSecondsError !== undefined) {
      if (metrics.fcSecondsError <= goldenCase.fcSecondsErrorTolerance) {
        passedGates.push("fc_timing");
      } else {
        failedGates.push("fc_timing");
      }
    }

    if (goldenCase.dropSecondsErrorTolerance !== undefined && metrics.dropSecondsError !== undefined) {
      if (metrics.dropSecondsError <= goldenCase.dropSecondsErrorTolerance) {
        passedGates.push("drop_timing");
      } else {
        failedGates.push("drop_timing");
      }
    }

    if (goldenCase.devPercentageErrorTolerance !== undefined && metrics.developmentRatioError !== undefined) {
      const devPercentageError = metrics.developmentRatioError * 100;
      if (devPercentageError <= goldenCase.devPercentageErrorTolerance) {
        passedGates.push("development_ratio");
      } else {
        failedGates.push("development_ratio");
      }
    }

    // Check RoR stability
    if (goldenCase.maxRorSpikes !== undefined && metrics.rorSpikes !== undefined) {
      if (metrics.rorSpikes <= goldenCase.maxRorSpikes) {
        passedGates.push("ror_spikes");
      } else {
        failedGates.push("ror_spikes");
        warnings.push(`RoR spikes (${metrics.rorSpikes}) exceeded tolerance (${goldenCase.maxRorSpikes})`);
      }
    }

    if (goldenCase.maxRorCrashes !== undefined && metrics.rorCrashes !== undefined) {
      if (metrics.rorCrashes <= goldenCase.maxRorCrashes) {
        passedGates.push("ror_crashes");
      } else {
        failedGates.push("ror_crashes");
        warnings.push(`RoR crashes (${metrics.rorCrashes}) exceeded tolerance (${goldenCase.maxRorCrashes})`);
      }
    }

    // Determine overall outcome
    let outcome: EvalOutcome;
    if (failedGates.length === 0) {
      outcome = "PASS";
    } else if (failedGates.length === 1 || warnings.length > 0) {
      outcome = "WARN";
    } else {
      outcome = "FAIL";
    }

    return { outcome, passedGates, failedGates, warnings };
  }

  /**
   * Determine if promotion is allowed based on eval results
   */
  canPromote(outcome: EvalOutcome, failedGates: string[]): boolean {
    // Require PASS for promotion
    if (outcome !== "PASS") return false;

    // No failed gates allowed
    if (failedGates.length > 0) return false;

    return true;
  }
}
