import {
  TelemetryEnvelopeSchema,
  TelemetryPointSchema,
  type RoastEvent,
  type TelemetryEnvelope
} from "@sim-corp/schemas";
import { DEFAULT_CONFIG, mergeConfig, type MachineHeuristicsConfig } from "./config";
import { detectCharge, detectDropDueToSilence, detectFirstCrack, detectTurningPoint } from "./heuristics";
import type { MachineKey } from "./state";
import { StateStore } from "./state";

interface EngineStatus {
  machines: ReturnType<StateStore["snapshot"]>;
  configs: Record<string, MachineHeuristicsConfig>;
}

export class InferenceEngine {
  private readonly state = new StateStore();
  private readonly configs = new Map<string, MachineHeuristicsConfig>();

  handleTelemetry(envelope: TelemetryEnvelope): RoastEvent[] {
    const parsed = TelemetryEnvelopeSchema.parse(envelope);
    if (parsed.topic !== "telemetry") {
      return [];
    }
    const telemetry = TelemetryPointSchema.parse(parsed.payload);
    const key: MachineKey = parsed.origin;
    const cfg = this.resolveConfig(key);

    const session = this.state.ensureSession(key);
    const events: RoastEvent[] = [];

    // Session gap detection
    const lastSeen = session.lastSeenAtIso ? Date.parse(session.lastSeenAtIso) : undefined;
    const nowMs = Date.now();
    if (!session.lastTelemetry || (lastSeen && (nowMs - lastSeen) / 1000 > cfg.sessionGapSeconds)) {
      session.emitted = { charge: false, tp: false, fc: false, drop: false };
    }

    // Append telemetry and mark last seen
    const updated = this.state.appendTelemetry(key, telemetry, cfg);

    // Charge
    if (!updated.emitted.charge) {
      const charge = detectCharge({ session: updated, config: cfg }, telemetry);
      if (charge) {
        events.push(charge);
        updated.emitted.charge = true;
      }
    }

    // Turning Point
    if (!updated.emitted.tp) {
      const tp = detectTurningPoint({ session: updated, config: cfg });
      if (tp) {
        events.push(tp);
        updated.emitted.tp = true;
      }
    }

    // First Crack
    if (!updated.emitted.fc) {
      const fc = detectFirstCrack({ session: updated, config: cfg });
      if (fc) {
        events.push(fc);
        updated.emitted.fc = true;
      }
    }

    return events;
  }

  tick(nowIso: string): Array<{ key: MachineKey; event: RoastEvent }> {
    const events: Array<{ key: MachineKey; event: RoastEvent }> = [];
    for (const status of this.state.snapshot()) {
      const session = this.state.get(status);
      if (!session) continue;
      const cfg = this.resolveConfig(status);
      const drop = detectDropDueToSilence({ session, config: cfg }, nowIso);
      if (drop) {
        session.emitted.drop = true;
        events.push({ key: status, event: drop });
        this.state.endSession(status);
      }
    }
    return events;
  }

  getStatus(): EngineStatus {
    return {
      machines: this.state.snapshot(),
      configs: Object.fromEntries(this.configs.entries())
    };
  }

  upsertConfig(key: MachineKey, cfg: Partial<MachineHeuristicsConfig>): MachineHeuristicsConfig {
    const merged = mergeConfig(this.resolveConfig(key), cfg);
    this.configs.set(toKey(key), merged);
    return merged;
  }

  private resolveConfig(key: MachineKey): MachineHeuristicsConfig {
    return this.configs.get(toKey(key)) ?? DEFAULT_CONFIG;
  }
}

function toKey(key: MachineKey): string {
  return `${key.orgId}|${key.siteId}|${key.machineId}`;
}
