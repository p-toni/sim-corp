import type { RoastAnalysis, GoldenCase, DetailedEvalMetrics, TelemetryPoint } from "@sim-corp/schemas";

export interface MetricsInput {
  goldenCase: GoldenCase;
  analysis: RoastAnalysis;
  telemetry?: TelemetryPoint[];
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
}

export class MetricsCalculator {
  calculate(input: MetricsInput): DetailedEvalMetrics {
    const { goldenCase, analysis, telemetry, commands } = input;

    // Timing errors
    const fcSecondsError = this.calculateTimingError(
      analysis.firstCrack.elapsedSeconds,
      goldenCase.targetFirstCrackSeconds
    );

    const dropSecondsError = this.calculateTimingError(
      analysis.drop.elapsedSeconds,
      goldenCase.targetDropSeconds
    );

    // Development ratio error
    const actualDevRatio = analysis.developmentRatio.value;
    const targetDevPercentage = goldenCase.targetDevelopmentPercentage;
    const targetDevRatio = targetDevPercentage !== undefined ? targetDevPercentage / 100 : undefined;
    const developmentRatioError = targetDevRatio !== undefined ? Math.abs(actualDevRatio - targetDevRatio) : undefined;

    // Temperature errors
    const fcTempError = this.calculateTempError(
      analysis.firstCrack.tempC,
      goldenCase.targetFCTempC
    );

    const dropTempError = this.calculateTempError(
      analysis.drop.tempC,
      goldenCase.targetDropTempC
    );

    // RoR stability (if telemetry available)
    const rorStats = telemetry ? this.calculateRoRStability(telemetry) : {
      rorSpikes: 0,
      rorCrashes: 0,
      rorStdDev: undefined
    };

    // Command metrics (if commands available)
    const commandMetrics = commands ? this.calculateCommandMetrics(commands, goldenCase) : {};

    return {
      fcSecondsError,
      dropSecondsError,
      developmentRatioError,
      fcTempError,
      dropTempError,
      ...rorStats,
      ...commandMetrics,
      timingVariance: undefined, // TODO: Calculate vs historical baseline
      tempVariance: undefined,
      cuppingScore: undefined,
      cuppingScoreDelta: undefined
    };
  }

  private calculateTimingError(actual: number | undefined, target: number | undefined): number | undefined {
    if (actual === undefined || target === undefined) return undefined;
    return Math.abs(actual - target);
  }

  private calculateTempError(actual: number | undefined, target: number | undefined): number | undefined {
    if (actual === undefined || target === undefined) return undefined;
    return Math.abs(actual - target);
  }

  private calculateRoRStability(telemetry: TelemetryPoint[]): {
    rorSpikes: number;
    rorCrashes: number;
    rorStdDev: number | undefined;
  } {
    const rorValues: number[] = [];
    let spikes = 0;
    let crashes = 0;

    // Collect RoR values
    for (const point of telemetry) {
      if (typeof point.rorCPerMin === "number" && Number.isFinite(point.rorCPerMin)) {
        rorValues.push(point.rorCPerMin);
      }
    }

    if (rorValues.length < 2) {
      return { rorSpikes: 0, rorCrashes: 0, rorStdDev: undefined };
    }

    // Calculate standard deviation
    const mean = rorValues.reduce((sum, val) => sum + val, 0) / rorValues.length;
    const variance = rorValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / rorValues.length;
    const rorStdDev = Math.sqrt(variance);

    // Define thresholds for spikes/crashes (could be configurable)
    const spikeThreshold = mean + 2 * rorStdDev; // 2 std devs above mean
    const crashThreshold = mean - 2 * rorStdDev; // 2 std devs below mean

    // Count spikes and crashes
    for (let i = 1; i < rorValues.length; i++) {
      const prev = rorValues[i - 1];
      const curr = rorValues[i];

      // Spike: sudden increase
      if (curr > spikeThreshold && curr - prev > rorStdDev) {
        spikes++;
      }

      // Crash: sudden decrease
      if (curr < crashThreshold && prev - curr > rorStdDev) {
        crashes++;
      }
    }

    return { rorSpikes: spikes, rorCrashes: crashes, rorStdDev };
  }

  private calculateCommandMetrics(
    commands: Array<{
      proposalId: string;
      commandType: string;
      targetValue?: number;
      proposedAt: string;
      approvedAt?: string;
      executedAt?: string;
      status: string;
      reasoning?: string;
      outcome?: string;
    }>,
    goldenCase: GoldenCase
  ): Partial<DetailedEvalMetrics> {
    const commandsProposed = commands.length;
    const commandsApproved = commands.filter(c => c.approvedAt).length;
    const commandsExecuted = commands.filter(c => c.executedAt).length;
    const commandsFailed = commands.filter(c => c.outcome === "FAILED").length;

    const commandSuccessRate = commandsExecuted > 0
      ? (commandsExecuted - commandsFailed) / commandsExecuted
      : undefined;

    // Calculate deviation from baseline commands
    const baselineCommandCount = goldenCase.baselineCommands?.length ?? 0;
    const commandsDeviation = Math.abs(commandsProposed - baselineCommandCount);

    // Simple command impact score:
    // Positive if fewer errors than baseline, negative if more
    // This is a placeholder - real impact would compare actual outcome metrics
    const commandImpactScore = undefined; // TODO: Implement based on timing/temp improvements

    return {
      commandsProposed,
      commandsApproved,
      commandsExecuted,
      commandsFailed,
      commandSuccessRate,
      commandsDeviation,
      commandImpactScore
    };
  }
}
