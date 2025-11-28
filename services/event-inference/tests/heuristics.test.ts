import { describe, expect, it } from "vitest";
import { detectTurningPoint, detectFirstCrack, detectDropDueToSilence } from "../src/core/heuristics";
import { DEFAULT_CONFIG } from "../src/core/config";
import type { SessionState } from "../src/core/state";

const baseSession = (): SessionState => ({
  sessionId: "s",
  startedAtIso: new Date(0).toISOString(),
  lastSeenAtIso: new Date(0).toISOString(),
  telemetry: [],
  emitted: { charge: true, tp: false, fc: false, drop: false }
});

describe("heuristics", () => {
  it("detects turning point via local minimum", () => {
    const session = baseSession();
    session.telemetry = [
      { ts: new Date(0).toISOString(), machineId: "m", elapsedSeconds: 0, btC: 180 },
      { ts: new Date(2000).toISOString(), machineId: "m", elapsedSeconds: 2, btC: 175 },
      { ts: new Date(4000).toISOString(), machineId: "m", elapsedSeconds: 4, btC: 176 }
    ];
    const tp = detectTurningPoint({ session, config: DEFAULT_CONFIG });
    expect(tp?.type).toBe("TP");
    expect(tp?.payload?.elapsedSeconds).toBe(2);
  });

  it("detects FC after min time and threshold", () => {
    const session = baseSession();
    session.telemetry = [
      { ts: new Date(0).toISOString(), machineId: "m", elapsedSeconds: 350, btC: 197, rorCPerMin: 10 }
    ];
    const fc = detectFirstCrack({ session, config: DEFAULT_CONFIG });
    expect(fc?.type).toBe("FC");
  });

  it("does not detect FC before min time even if hot", () => {
    const session = baseSession();
    session.telemetry = [
      { ts: new Date(0).toISOString(), machineId: "m", elapsedSeconds: 100, btC: 210 }
    ];
    const fc = detectFirstCrack({ session, config: DEFAULT_CONFIG });
    expect(fc).toBeNull();
  });

  it("detects drop after silence", () => {
    const session = baseSession();
    session.lastSeenAtIso = new Date(0).toISOString();
    session.lastTelemetry = { ts: new Date(0).toISOString(), machineId: "m", elapsedSeconds: 50, btC: 200 };
    const drop = detectDropDueToSilence(
      { session, config: { ...DEFAULT_CONFIG, dropSilenceSeconds: 5 } },
      new Date(7000).toISOString()
    );
    expect(drop?.type).toBe("DROP");
  });
});
