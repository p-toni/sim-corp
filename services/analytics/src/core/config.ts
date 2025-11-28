export interface AnalysisConfig {
  dryEndBtC: number;
  dryingAfterTpSeconds: number;
  postFcWindowSeconds: number;
  crashDropThreshold: number;
  crashMinRor: number;
  crashSustainSeconds: number;
  flickRiseThreshold: number;
  smoothnessK: number;
}

export const DEFAULT_CONFIG: AnalysisConfig = {
  dryEndBtC: 150,
  dryingAfterTpSeconds: 90,
  postFcWindowSeconds: 120,
  crashDropThreshold: 8,
  crashMinRor: 3,
  crashSustainSeconds: 10,
  flickRiseThreshold: 6,
  smoothnessK: 0.5
};
