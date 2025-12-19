import { describe, expect, it } from "vitest";
import {
  AgentCardSchema,
  AgentTraceSchema,
  CuppingSchema,
  EvalRunSchema,
  GoldenCaseSchema,
  MissionSchema,
  PolicyCheckRequestSchema,
  PolicyCheckResultSchema,
  ToolCardSchema,
  RoastEventSchema,
  RoastSchema,
  RoastSessionSchema,
  RoastSessionSummarySchema,
  RoastAnalysisSchema,
  SessionMetaSchema,
  SessionNoteSchema,
  EventOverrideSchema,
  RoastReportSchema,
  TelemetryPointSchema,
  TelemetryEnvelopeSchema,
  SessionClosedEventSchema,
  MissionSignalsSchema,
  GovernanceDecisionSchema,
  RoastProfileSchema,
  RoastProfileVersionSchema,
  RoastPredictionSchema,
  getEnvelopeSigningBytes,
  toSignableEnvelope
} from "./index";

const baseTelemetry = {
  ts: "2025-01-01T00:00:00.000Z",
  machineId: "machine-1",
  batchId: "batch-1",
  elapsedSeconds: 12,
  btC: 190.2,
  gasPct: 25
};

describe("roaster schemas", () => {
  it("validates telemetry points", () => {
    const parsed = TelemetryPointSchema.parse(baseTelemetry);
    expect(parsed.machineId).toBe("machine-1");
    expect(parsed.extras).toEqual({});
  });

  it("rejects invalid gas percentage", () => {
    const result = TelemetryPointSchema.safeParse({ ...baseTelemetry, gasPct: 200 });
    expect(result.success).toBe(false);
  });

  it("validates roasts with events and telemetry", () => {
    const roast = RoastSchema.parse({
      id: "roast-1",
      machineId: "machine-1",
      batchId: "batch-1",
      startedAt: "2025-01-01T00:00:00.000Z",
      telemetry: [baseTelemetry],
      events: [
        RoastEventSchema.parse({
          ts: "2025-01-01T00:05:00.000Z",
          machineId: "machine-1",
          type: "CHARGE"
        })
      ]
    });

    expect(roast.events).toHaveLength(1);
  });

  it("parses cupping records", () => {
    const cupping = CuppingSchema.parse({
      id: "cup-1",
      roastId: "roast-1",
      recordedAt: "2025-01-01T01:00:00.000Z",
      score: 85,
      flavorNotes: ["cacao", "stone fruit"]
    });

    expect(cupping.score).toBe(85);
  });

  it("parses agent and tool cards", () => {
    const agent = AgentCardSchema.parse({
      id: "strategist:v1",
      name: "Strategist",
      role: "strategist",
      version: "1.0.0"
    });

    expect(agent.capabilities).toEqual([]);

    const tool = ToolCardSchema.parse({
      id: "search:v1",
      name: "WebSearch",
      version: "1.0.0"
    });

    expect(tool.policyTags).toEqual([]);
  });
});

describe("telemetry envelope schema", () => {
  const baseEnvelope = {
    ts: "2025-01-01T00:00:00.000Z",
    origin: { orgId: "org-1", siteId: "site-1", machineId: "machine-1" },
    payload: baseTelemetry
  };

  it("parses telemetry envelope payloads", () => {
    const parsed = TelemetryEnvelopeSchema.parse({
      ...baseEnvelope,
      topic: "telemetry"
    });

    expect(parsed.topic).toBe("telemetry");
    expect(parsed.payload.machineId).toBe("machine-1");
  });

  it("parses event envelope payloads", () => {
    const parsed = TelemetryEnvelopeSchema.parse({
      ...baseEnvelope,
      topic: "event",
      payload: {
        ts: "2025-01-01T00:05:00.000Z",
        machineId: "machine-1",
        type: "CHARGE"
      }
    });

    expect(parsed.topic).toBe("event");
    const eventPayload = parsed.payload as { type: string };
    expect(eventPayload.type).toBe("CHARGE");
  });

  it("allows optional sessionId", () => {
    const parsed = TelemetryEnvelopeSchema.parse({
      ...baseEnvelope,
      topic: "telemetry",
      sessionId: "session-1"
    });
    expect(parsed.sessionId).toBe("session-1");
  });

  it("rejects invalid payload shape", () => {
    const result = TelemetryEnvelopeSchema.safeParse({
      ...baseEnvelope,
      topic: "telemetry",
      payload: { machineId: "machine-1" }
    });

    expect(result.success).toBe(false);
  });
});

describe("telemetry envelope signing", () => {
  const baseEnvelope = TelemetryEnvelopeSchema.parse({
    ts: "2025-01-01T00:00:00.000Z",
    origin: { orgId: "org-1", siteId: "site-1", machineId: "machine-1" },
    topic: "telemetry",
    payload: baseTelemetry,
    sessionId: "session-1",
    kid: "device:driver@org-1/site-1/machine-1"
  });

  it("produces stable signing bytes for the same envelope", () => {
    const first = getEnvelopeSigningBytes(baseEnvelope);
    const second = getEnvelopeSigningBytes({ ...baseEnvelope });
    expect(Buffer.from(first).toString("utf-8")).toBe(Buffer.from(second).toString("utf-8"));
  });

  it("changes signing bytes when envelope data changes", () => {
    const original = getEnvelopeSigningBytes(baseEnvelope);
    const changed = getEnvelopeSigningBytes({
      ...baseEnvelope,
      payload: { ...baseEnvelope.payload, btC: 200 }
    });
    expect(Buffer.from(original).toString("utf-8")).not.toBe(Buffer.from(changed).toString("utf-8"));
  });

  it("includes kid and sessionId in signable object when present", () => {
    const signable = toSignableEnvelope(baseEnvelope);
    expect(signable.kid).toBe(baseEnvelope.kid);
    expect(signable.sessionId).toBe(baseEnvelope.sessionId);
  });
});

describe("roast session schemas", () => {
  it("parses session summary and defaults meta", () => {
    const summary = {
      sessionId: "s1",
      orgId: "o1",
      siteId: "s1",
      machineId: "m1",
      startedAt: "2025-01-01T00:00:00.000Z",
      endedAt: null,
      status: "ACTIVE" as const
    };
    const parsed = RoastSessionSummarySchema.parse(summary);
    expect(parsed.sessionId).toBe("s1");

    const session = RoastSessionSchema.parse(summary);
    expect(session.meta).toEqual({});
  });
});

describe("roast analysis schema", () => {
  it("parses roast analysis with defaults", () => {
    const analysis = RoastAnalysisSchema.parse({
      sessionId: "s1",
      orgId: "o",
      siteId: "s",
      machineId: "m",
      computedAt: new Date().toISOString(),
      phases: [],
      phaseStats: [],
      crashFlick: { crashDetected: false, flickDetected: false }
    });
    expect(analysis.warnings).toEqual([]);
    expect(analysis.recommendations).toEqual([]);
    expect(analysis.config).toEqual({});
    expect(analysis.eventTimeSource).toEqual({});
    expect(analysis.overrideDeltasSeconds).toEqual({});
  });
});

describe("qc schemas", () => {
  it("parses session meta with defaults", () => {
    const meta = SessionMetaSchema.parse({ beanName: "Colombia" });
    expect(meta.tags).toEqual([]);
    expect(meta.extra).toEqual({});
  });

  it("parses session note and fills defaults", () => {
    const note = SessionNoteSchema.parse({
      noteId: "n1",
      createdAt: "2025-01-01T00:00:00.000Z",
      text: "Tastes great"
    });
    expect(note.defects).toEqual([]);
    expect(note.extra).toEqual({});
  });

  it("validates event overrides", () => {
    const override = EventOverrideSchema.parse({
      eventType: "FC",
      elapsedSeconds: 480,
      updatedAt: "2025-01-01T00:10:00.000Z"
    });
    expect(override.source).toBe("HUMAN");
  });
});

describe("roast profile schemas", () => {
  const baseProfile = {
    profileId: "P-123",
    name: "House Blend",
    version: 1,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    orgId: "org-1",
    targets: {
      chargeTempC: 200,
      turningPointTempC: 100,
      firstCrackTempC: 200,
      dropTempC: 210,
      targetDevRatio: 0.2,
      targetTimeToFCSeconds: 500,
      targetDropSeconds: 650
    },
    tags: ["house"],
    source: { kind: "MANUAL" as const }
  };

  it("parses roast profiles with optional curve", () => {
    const parsed = RoastProfileSchema.parse({
      ...baseProfile,
      curve: {
        points: [
          { elapsedSeconds: 0, btC: 180 },
          { elapsedSeconds: 60, btC: 190, rorCPerMin: 12 }
        ],
        tolerance: { btC: 3 }
      }
    });

    expect(parsed.name).toBe("House Blend");
    expect(parsed.curve?.points.length).toBe(2);
  });

  it("rejects invalid dev ratio", () => {
    const result = RoastProfileSchema.safeParse({
      ...baseProfile,
      targets: { ...baseProfile.targets, targetDevRatio: 2 }
    });
    expect(result.success).toBe(false);
  });

  it("parses profile versions", () => {
    const version = RoastProfileVersionSchema.parse({
      profileId: baseProfile.profileId,
      version: 1,
      createdAt: baseProfile.createdAt,
      snapshot: baseProfile,
      changeNote: "Initial"
    });

    expect(version.snapshot.profileId).toBe("P-123");
    expect(version.changeNote).toBe("Initial");
  });
});

describe("roast report schema", () => {
  it("parses roast report with defaults", () => {
    const report = RoastReportSchema.parse({
      reportId: "r-1",
      sessionId: "s1",
      orgId: "o1",
      siteId: "site",
      machineId: "mach",
      createdAt: "2025-01-01T00:00:00.000Z",
      analysis: RoastAnalysisSchema.parse({
        sessionId: "s1",
        orgId: "o1",
        siteId: "site",
        machineId: "mach",
        computedAt: "2025-01-01T00:00:00.000Z",
        phases: [],
        phaseStats: [],
        crashFlick: { crashDetected: false, flickDetected: false }
      }),
      markdown: "# Report"
    });

    expect(report.createdBy).toBe("AGENT");
    expect(report.overrides).toEqual([]);
    expect(report.notes).toEqual([]);
    expect(report.nextActions).toEqual([]);
  });

  it("requires ids to be strings", () => {
    const result = RoastReportSchema.safeParse({
      reportId: 123,
      sessionId: "s1",
      orgId: "o1",
      siteId: "site",
      machineId: "mach",
      createdAt: "2025-01-01T00:00:00.000Z",
      analysis: {
        sessionId: "s1",
        orgId: "o1",
        siteId: "site",
        machineId: "mach",
        computedAt: "2025-01-01T00:00:00.000Z",
        phases: [],
        phaseStats: [],
        crashFlick: { crashDetected: false, flickDetected: false }
      },
      markdown: "ok"
    });

    expect(result.success).toBe(false);
  });
});

describe("ops event schemas", () => {
  it("parses session.closed with default reportKind", () => {
    const event = SessionClosedEventSchema.parse({
      type: "session.closed",
      version: 1,
      emittedAt: "2025-01-01T00:00:00.000Z",
      orgId: "o",
      siteId: "s",
      machineId: "m",
      sessionId: "sess-1"
    });
    expect(event.reportKind).toBe("POST_ROAST_V1");
  });

  it("requires required identifiers", () => {
    const result = SessionClosedEventSchema.safeParse({
      type: "session.closed",
      version: 1,
      emittedAt: "2025-01-01T00:00:00.000Z"
    });
    expect(result.success).toBe(false);
  });
});

describe("kernel schemas", () => {
  it("creates missions with defaults", () => {
    const mission = MissionSchema.parse({
      goal: {
        title: "Simulated roast",
        desiredOutcome: "Complete roast in twin"
      }
    });

    expect(mission.priority).toBe("MEDIUM");
    expect(mission.constraints).toHaveLength(0);
    expect(mission.params).toEqual({});
    expect(mission.context).toEqual({});
    expect(mission.signals).toBeUndefined();
    expect(mission.governance).toBeUndefined();
  });

  it("allows overriding mission params", () => {
    const mission = MissionSchema.parse({
      missionId: "mission-roast",
      goal: { title: "Simulated roast" },
      params: { targetDropSeconds: 650 }
    });

    expect(mission.params).toEqual({ targetDropSeconds: 650 });
  });

  it("validates policy requests and results", () => {
    const request = PolicyCheckRequestSchema.parse({
      agentId: "agent-1",
      tool: "ingestion",
      action: "publish",
      resource: "telemetry"
    });

    const result = PolicyCheckResultSchema.parse({
      request,
      decision: "ALLOW",
      checkedAt: "2025-01-01T00:00:00.000Z"
    });

    expect(result.request.agentId).toBe("agent-1");
    expect(result.decision).toBe("ALLOW");
  });

  it("parses agent traces", () => {
    const trace = AgentTraceSchema.parse({
      traceId: "trace-1",
      agentId: "agent-1",
      missionId: "mission-1",
      mission: {
        missionId: "mission-1",
        goal: { title: "Test", description: "" },
        constraints: [],
        context: {}
      },
      status: "SUCCESS",
      startedAt: "2025-01-01T00:00:00.000Z",
      entries: [
        {
          missionId: "mission-1",
          loopId: "loop-1",
          iteration: 0,
          step: "THINK",
          startedAt: "2025-01-01T00:00:00.000Z",
          toolCalls: [],
          metrics: []
        }
      ]
    });

    const entry = trace.entries[0];
    expect(entry).toBeDefined();
    expect(entry?.step).toBe("THINK");
  });

  it("applies defaults for mission signals", () => {
    const signals = MissionSignalsSchema.parse({});
    expect(signals.session).toEqual({});
  });

  it("applies defaults for governance decision", () => {
    const decision = GovernanceDecisionSchema.parse({
      action: "ALLOW",
      decidedAt: "2025-01-01T00:00:00.000Z"
    });
    expect(decision.confidence).toBe("LOW");
    expect(decision.reasons).toEqual([]);
    expect(decision.decidedBy).toBe("KERNEL_GOVERNOR");
  });

  it("parses roast predictions with suggestions", () => {
    const prediction = RoastPredictionSchema.parse({
      sessionId: "session-1",
      atTs: "2025-01-01T00:10:00.000Z",
      phase: "MAILLARD",
      inputs: { pointsUsed: 24, channelsAvailable: ["btC", "rorCPerMin"], profileId: "profile-1" },
      etaSeconds: { toFC: 60, toDrop: 300 },
      predictedTimes: { fcAtElapsedSeconds: 420, dropAtElapsedSeconds: 720 },
      predictedDevRatio: 0.18,
      confidence: {
        overall: 0.72,
        components: { dataQuality: 0.8, modelFit: 0.7, phaseFit: 0.8, profileFit: 0.6 },
        reasons: ["Stable RoR", "Profile targets present"]
      },
      suggestions: [
        {
          kind: "TIMING",
          title: "Trending late vs target",
          detail: "Projected drop is 20s after target",
          severity: "WARN",
          requiresApproval: false
        }
      ],
      explain: {
        method: "HEURISTIC_V1",
        features: { slope: 2.1, volatility: 0.5 },
        lastObserved: { elapsedSeconds: 420, btC: 190, rorCPerMin: 12 }
      }
    });

    expect(prediction.inputs.pointsUsed).toBe(24);
    expect(prediction.suggestions[0]?.requiresApproval).toBe(false);
  });

  it("validates eval artifacts", () => {
    const golden = GoldenCaseSchema.parse({
      id: "case-1",
      name: "Baseline Ethiopia",
      machineId: "machine-1"
    });

    expect(golden.metadata).toBeUndefined();

    const evalRun = EvalRunSchema.parse({
      id: "eval-1",
      runAt: "2025-01-01T00:00:00.000Z",
      outcome: "PASS",
      metrics: [
        {
          name: "timingError",
          value: 2.5,
          unit: "seconds"
        }
      ]
    });

    const metric = evalRun.metrics[0];
    expect(metric).toBeDefined();
    expect(metric?.name).toBe("timingError");
  });
});
