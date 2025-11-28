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
  TelemetryEnvelopeSchema
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
