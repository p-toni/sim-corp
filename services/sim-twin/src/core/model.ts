import type { RoastEvent, TelemetryPoint } from "@sim-corp/schemas";
import type { SimRoastRequest } from "./types";

export interface SimRoastResult {
  telemetry: TelemetryPoint[];
  events: RoastEvent[];
}

type Rng = () => number;

export function simulateRoast(input: SimRoastRequest): SimRoastResult {
  const rng = createRng(input.seed);
  const gaussian = createGaussianSampler(rng);

  const dropHorizon = input.targetDropSeconds;
  const sampleInterval = input.sampleIntervalSeconds;
  const fcRatio = clamp(input.targetFirstCrackSeconds / dropHorizon, 0.2, 0.9);
  const batchFactor = clamp(input.batchSizeKg / 5, 0.5, 1.5);
  // TODO(@human): refine FC temp estimation if we add more machine parameters.
  const fcTemp = input.chargeTempC + (input.maxTempC - input.chargeTempC) * (0.7 + 0.05 * (1 - batchFactor));

  const tpTime = clamp(60 + rng() * 30, 30, input.targetFirstCrackSeconds - 30);
  const fcTime = clamp(input.targetFirstCrackSeconds + gaussian() * 10, tpTime + 30, dropHorizon - 30);
  const dropTime = clamp(input.targetDropSeconds + gaussian() * 8, fcTime + 30, dropHorizon);

  const baseEpochSeconds = input.seed ?? Math.floor(Date.now() / 1000);
  const baseEpochMs = baseEpochSeconds * 1000;
  const timestampFor = (elapsedSeconds: number): string => new Date(baseEpochMs + elapsedSeconds * 1000).toISOString();
  const batchId = `SIM-BATCH-${String(baseEpochSeconds)}`;

  const telemetry: TelemetryPoint[] = [];
  let previousBt = input.chargeTempC;
  let previousTime = 0;

  const timeline = buildTimeline(dropHorizon, sampleInterval);
  for (const elapsedSeconds of timeline) {
    const normalizedTime = elapsedSeconds / dropHorizon;
    const baseBt = computeBaseBt(normalizedTime, fcRatio, input, fcTemp);
    const noisyBt = baseBt + gaussian() * input.noiseStdDev;
    let btC = clamp(noisyBt, input.chargeTempC, input.maxTempC);
    if (telemetry.length > 0 && btC < previousBt) {
      btC = previousBt - Math.min(0.5, previousBt - input.chargeTempC);
    }

    const deltaSeconds = elapsedSeconds - previousTime;
    const rorCPerMin = deltaSeconds > 0 ? ((btC - previousBt) / deltaSeconds) * 60 : 0;
    const etLead = 12 * Math.exp(-2.5 * normalizedTime) + 3;
    const etC = Math.min(input.maxTempC + 10, btC + etLead);

    telemetry.push({
      ts: timestampFor(elapsedSeconds),
      machineId: input.machineId,
      batchId,
      elapsedSeconds: Number(elapsedSeconds.toFixed(2)),
      btC: Number(btC.toFixed(2)),
      etC: Number(etC.toFixed(2)),
      rorCPerMin: Number(rorCPerMin.toFixed(2)),
      ambientC: input.ambientTempC,
      extras: {}
    });

    previousBt = btC;
    previousTime = elapsedSeconds;
  }

  const events: RoastEvent[] = [
    createRoastEvent("CHARGE", 0, input, batchId, timestampFor),
    createRoastEvent("TP", tpTime, input, batchId, timestampFor),
    createRoastEvent("FC", fcTime, input, batchId, timestampFor, input.targetFirstCrackSeconds),
    createRoastEvent("DROP", dropTime, input, batchId, timestampFor, input.targetDropSeconds)
  ];

  return { telemetry, events };
}

function buildTimeline(dropHorizon: number, sampleInterval: number): number[] {
  const times: number[] = [];
  for (let t = 0; t <= dropHorizon; t += sampleInterval) {
    times.push(Number(Math.min(t, dropHorizon).toFixed(3)));
  }
  if (times[times.length - 1] !== dropHorizon) {
    times.push(dropHorizon);
  }
  return times;
}

function computeBaseBt(
  normalizedTime: number,
  fcRatio: number,
  input: SimRoastRequest,
  fcTemp: number
): number {
  if (normalizedTime <= fcRatio) {
    const progress = normalizedTime / fcRatio;
    return input.chargeTempC + (fcTemp - input.chargeTempC) * smoothstep(progress);
  }

  const postRatio = (normalizedTime - fcRatio) / (1 - fcRatio);
  return fcTemp + (input.maxTempC - fcTemp) * easeOutCubic(postRatio);
}

function createRoastEvent(
  type: RoastEvent["type"],
  elapsedSeconds: number,
  input: SimRoastRequest,
  batchId: string,
  timestampFor: (elapsedSeconds: number) => string,
  targetSeconds?: number
): RoastEvent {
  const payload: Record<string, unknown> = {
    elapsedSeconds: Number(elapsedSeconds.toFixed(2))
  };
  if (typeof targetSeconds === "number") {
    payload.targetSeconds = targetSeconds;
  }

  return {
    ts: timestampFor(elapsedSeconds),
    machineId: input.machineId,
    batchId,
    type,
    payload
  };
}

function createRng(seed: number | undefined): Rng {
  let state = (seed ?? Date.now()) >>> 0;
  if (state === 0) {
    state = 0x1abcdef;
  }
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function createGaussianSampler(rng: Rng): () => number {
  let spare: number | undefined;
  return () => {
    if (spare !== undefined) {
      const value = spare;
      spare = undefined;
      return value;
    }
    const u = Math.max(rng(), Number.EPSILON);
    const v = rng();
    const mag = Math.sqrt(-2 * Math.log(u));
    const z0 = mag * Math.cos(2 * Math.PI * v);
    spare = mag * Math.sin(2 * Math.PI * v);
    return z0;
  };
}

function smoothstep(t: number): number {
  const clamped = clamp(t, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function easeOutCubic(t: number): number {
  const clamped = clamp(t, 0, 1);
  return 1 - Math.pow(1 - clamped, 3);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
