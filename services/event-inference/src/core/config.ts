export interface MachineHeuristicsConfig {
  sessionGapSeconds: number;
  tpSearchWindowSeconds: number;
  minFirstCrackSeconds: number;
  fcBtThresholdC: number;
  fcRorMaxThreshold?: number;
  dropSilenceSeconds: number;
  maxBufferPoints: number;
}

export const DEFAULT_CONFIG: MachineHeuristicsConfig = {
  sessionGapSeconds: 30,
  tpSearchWindowSeconds: 180,
  minFirstCrackSeconds: 300,
  fcBtThresholdC: 196,
  dropSilenceSeconds: 10,
  maxBufferPoints: 2000
};

export function mergeConfig(
  base: MachineHeuristicsConfig,
  override?: Partial<MachineHeuristicsConfig>
): MachineHeuristicsConfig {
  if (!override) return base;
  return { ...base, ...override };
}
