import Anthropic from "@anthropic-ai/sdk";
import type {
  LMJudgeScore,
  RoastAnalysis,
  GoldenCase,
  TelemetryPoint,
} from "@sim-corp/schemas";

export interface LMJudgeConfig {
  enabled: boolean;
  apiKey?: string;
  model?: string;
}

export interface JudgeInput {
  goldenCase: GoldenCase;
  analysis: RoastAnalysis;
  telemetry?: TelemetryPoint[];
  sessionId: string;
}

/**
 * LM-as-judge for evaluating roasting plans and outcomes
 *
 * Uses Claude to assess:
 * - Plan clarity and explainability
 * - Physics plausibility (temperature curves, RoR patterns)
 * - Constraint respect (adherence to golden case tolerances)
 * - Safety considerations (dangerous patterns, risky maneuvers)
 */
export class LMJudge {
  private readonly client: Anthropic | null;
  private readonly modelId: string;

  constructor(private readonly config: LMJudgeConfig) {
    this.modelId = config.model ?? "claude-3-5-sonnet-20241022";

    if (config.enabled && config.apiKey) {
      this.client = new Anthropic({
        apiKey: config.apiKey,
      });
    } else {
      this.client = null;
    }
  }

  /**
   * Evaluate a roast session against a golden case
   */
  async evaluate(input: JudgeInput): Promise<LMJudgeScore | null> {
    if (!this.config.enabled || !this.client) {
      return null;
    }

    const prompt = this.buildPrompt(input);

    try {
      const response = await this.client.messages.create({
        model: this.modelId,
        max_tokens: 2000,
        temperature: 0.3, // Lower temperature for more consistent judging
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== "text") {
        throw new Error("Unexpected response type from Claude");
      }

      // Parse the JSON response
      const result = JSON.parse(content.text);

      // Build LMJudgeScore
      const score: LMJudgeScore = {
        planClarity: this.clampScore(result.planClarity ?? 0),
        physicsPlausibility: this.clampScore(result.physicsPlausibility ?? 0),
        constraintRespect: this.clampScore(result.constraintRespect ?? 0),
        safetyScore: this.clampScore(result.safetyScore ?? 0),
        safetyWarnings: result.safetyWarnings ?? [],
        physicsViolations: result.physicsViolations ?? [],
        constraintViolations: result.constraintViolations ?? [],
        modelId: this.modelId,
        evaluatedAt: new Date().toISOString(),
        reasoning: result.reasoning,
      };

      return score;
    } catch (error) {
      console.error("LM judge evaluation failed:", error);
      return null;
    }
  }

  /**
   * Build the evaluation prompt for Claude
   */
  private buildPrompt(input: JudgeInput): string {
    const { goldenCase, analysis } = input;

    // Extract key metrics from analysis
    const fcTime = analysis.firstCrack?.elapsedSeconds ?? null;
    const dropTime = analysis.drop?.elapsedSeconds ?? null;
    const fcTemp = analysis.firstCrack?.tempC ?? null;
    const dropTemp = analysis.drop?.tempC ?? null;
    const devRatio = analysis.developmentRatio?.value ?? null;

    // Calculate errors vs golden case
    const fcError = fcTime !== null && goldenCase.targetFirstCrackSeconds
      ? Math.abs(fcTime - goldenCase.targetFirstCrackSeconds)
      : null;
    const dropError = dropTime !== null && goldenCase.targetDropSeconds
      ? Math.abs(dropTime - goldenCase.targetDropSeconds)
      : null;
    const devError = devRatio !== null && goldenCase.targetDevelopmentPercentage
      ? Math.abs(devRatio - goldenCase.targetDevelopmentPercentage / 100)
      : null;

    return `You are an expert coffee roasting consultant evaluating a roast session. Your role is to assess the quality, safety, and physics plausibility of the roast.

**Golden Case (Target):**
- Name: ${goldenCase.name}
- Description: ${goldenCase.description ?? "N/A"}
- Bean: ${goldenCase.origin ?? "Unknown"} ${goldenCase.variety ?? ""} (${goldenCase.processingMethod ?? "Unknown"})
- Machine: ${goldenCase.machineId}
- Batch Size: ${goldenCase.batchSizeKg} kg
- Charge Temp: ${goldenCase.chargeTempC ?? "N/A"}°C
- Target FC Time: ${goldenCase.targetFirstCrackSeconds}s (±${goldenCase.fcSecondsErrorTolerance}s tolerance)
- Target Drop Time: ${goldenCase.targetDropSeconds}s (±${goldenCase.dropSecondsErrorTolerance}s tolerance)
- Target Development: ${goldenCase.targetDevelopmentPercentage}% (±${goldenCase.devPercentageErrorTolerance}% tolerance)
- Target FC Temp: ${goldenCase.targetFCTempC ?? "N/A"}°C
- Target Drop Temp: ${goldenCase.targetDropTempC ?? "N/A"}°C
- Max RoR Spikes: ${goldenCase.maxRorSpikes ?? "N/A"}
- Max RoR Crashes: ${goldenCase.maxRorCrashes ?? "N/A"}

**Actual Session Results:**
- Session ID: ${input.sessionId}
- FC Time: ${fcTime ?? "N/A"}s (error: ${fcError !== null ? fcError + "s" : "N/A"})
- Drop Time: ${dropTime ?? "N/A"}s (error: ${dropError !== null ? dropError + "s" : "N/A"})
- FC Temp: ${fcTemp ?? "N/A"}°C
- Drop Temp: ${dropTemp ?? "N/A"}°C
- Development Ratio: ${devRatio !== null ? (devRatio * 100).toFixed(1) : "N/A"}% (error: ${devError !== null ? (devError * 100).toFixed(1) + "%" : "N/A"})
- Crash/Flick Detected: ${analysis.crashFlick?.detected ? "Yes" : "No"}

**Your Task:**
Evaluate this roast session on four dimensions (0-100 scale):

1. **Plan Clarity** (0-100): How well-defined and explainable is the roast progression? Are the key events (TP, FC, drop) clearly identified?

2. **Physics Plausibility** (0-100): Does the roast follow realistic physics? Are temperature progressions, RoR patterns, and timing plausible for this bean/machine/batch?

3. **Constraint Respect** (0-100): How well does the roast adhere to the golden case tolerances? Are errors within acceptable ranges?

4. **Safety Score** (0-100): Are there any dangerous patterns (extreme RoR spikes/crashes, scorching risk, underdevelopment risk)?

**Response Format (JSON only):**
{
  "planClarity": <0-100>,
  "physicsPlausibility": <0-100>,
  "constraintRespect": <0-100>,
  "safetyScore": <0-100>,
  "safetyWarnings": ["array of specific safety concerns, empty if none"],
  "physicsViolations": ["array of physics implausibilities, empty if none"],
  "constraintViolations": ["array of constraint breaches, empty if none"],
  "reasoning": "Brief explanation (2-3 sentences) of the overall assessment"
}

Respond with ONLY valid JSON. No markdown, no explanation outside the JSON.`;
  }

  /**
   * Clamp score to 0-100 range
   */
  private clampScore(score: number): number {
    return Math.max(0, Math.min(100, score));
  }
}
