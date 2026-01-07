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
  RoasterCommandSchema,
  CommandProposalSchema,
  CommandExecutionResultSchema,
  CommandApprovalRequestSchema,
  CommandApprovalResponseSchema,
  CommandBatchSchema,
  CommandConstraintsPresetSchema,
  ProposeCommandRequestSchema,
  CommandMetricsSchema,
  CommandTimeseriesMetricsSchema,
  CommandAlertSchema,
  CommandSummarySchema
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

describe("command schemas", () => {
  it("validates roaster commands", () => {
    const command = RoasterCommandSchema.parse({
      commandId: "cmd-1",
      commandType: "SET_POWER",
      machineId: "machine-1",
      targetValue: 75,
      targetUnit: "%",
      timestamp: "2025-01-01T00:00:00.000Z"
    });

    expect(command.commandType).toBe("SET_POWER");
    expect(command.targetValue).toBe(75);
    expect(command.constraints.requireStates).toEqual([]);
    expect(command.constraints.forbiddenStates).toEqual([]);
    expect(command.metadata).toEqual({});
  });

  it("validates power command with constraints", () => {
    const command = RoasterCommandSchema.parse({
      commandId: "cmd-2",
      commandType: "SET_POWER",
      machineId: "machine-1",
      targetValue: 80,
      constraints: {
        minValue: 0,
        maxValue: 100,
        rampRate: 5,
        requireStates: ["RUNNING"],
        forbiddenStates: ["IDLE"]
      },
      timestamp: "2025-01-01T00:00:00.000Z"
    });

    expect(command.constraints.minValue).toBe(0);
    expect(command.constraints.maxValue).toBe(100);
    expect(command.constraints.rampRate).toBe(5);
    expect(command.constraints.requireStates).toEqual(["RUNNING"]);
  });

  it("validates abort command without target value", () => {
    const command = RoasterCommandSchema.parse({
      commandId: "cmd-abort",
      commandType: "ABORT",
      machineId: "machine-1",
      timestamp: "2025-01-01T00:00:00.000Z"
    });

    expect(command.commandType).toBe("ABORT");
    expect(command.targetValue).toBeUndefined();
  });

  it("validates command proposal lifecycle", () => {
    const proposal = CommandProposalSchema.parse({
      proposalId: "prop-1",
      command: {
        commandId: "cmd-1",
        commandType: "SET_FAN",
        machineId: "machine-1",
        targetValue: 7,
        timestamp: "2025-01-01T00:00:00.000Z"
      },
      proposedBy: "AGENT",
      agentName: "sim-roast-runner",
      agentVersion: "1.0.0",
      reasoning: "Increase airflow to prevent RoR crash",
      sessionId: "session-1",
      missionId: "mission-1",
      status: "PENDING_APPROVAL",
      createdAt: "2025-01-01T00:00:00.000Z"
    });

    expect(proposal.status).toBe("PENDING_APPROVAL");
    expect(proposal.proposedBy).toBe("AGENT");
    expect(proposal.agentName).toBe("sim-roast-runner");
    expect(proposal.approvalRequired).toBe(true);
    expect(proposal.approvalTimeoutSeconds).toBe(300); // default 5 minutes
  });

  it("validates approved command proposal", () => {
    const proposal = CommandProposalSchema.parse({
      proposalId: "prop-2",
      command: {
        commandId: "cmd-2",
        commandType: "SET_POWER",
        machineId: "machine-1",
        targetValue: 75,
        timestamp: "2025-01-01T00:00:00.000Z"
      },
      proposedBy: "AGENT",
      reasoning: "Reduce power to prevent overshoot",
      status: "APPROVED",
      createdAt: "2025-01-01T00:00:00.000Z",
      approvedBy: {
        kind: "USER",
        id: "user-1",
        display: "Operator Alice"
      },
      approvedAt: "2025-01-01T00:00:30.000Z"
    });

    expect(proposal.status).toBe("APPROVED");
    expect(proposal.approvedBy).toBeDefined();
    expect(proposal.approvedBy?.kind).toBe("USER");
  });

  it("validates rejected command proposal with reason", () => {
    const proposal = CommandProposalSchema.parse({
      proposalId: "prop-3",
      command: {
        commandId: "cmd-3",
        commandType: "SET_DRUM",
        machineId: "machine-1",
        targetValue: 65,
        timestamp: "2025-01-01T00:00:00.000Z"
      },
      proposedBy: "AGENT",
      reasoning: "Increase drum speed for better mixing",
      status: "REJECTED",
      createdAt: "2025-01-01T00:00:00.000Z",
      rejectedBy: {
        kind: "USER",
        id: "user-1"
      },
      rejectedAt: "2025-01-01T00:00:30.000Z",
      rejectionReason: {
        code: "UNSAFE_STATE",
        message: "Roaster not in valid state for drum speed change",
        details: { currentState: "PREHEATING" }
      }
    });

    expect(proposal.status).toBe("REJECTED");
    expect(proposal.rejectionReason?.code).toBe("UNSAFE_STATE");
  });

  it("validates completed command with outcome", () => {
    const proposal = CommandProposalSchema.parse({
      proposalId: "prop-4",
      command: {
        commandId: "cmd-4",
        commandType: "SET_POWER",
        machineId: "machine-1",
        targetValue: 80,
        timestamp: "2025-01-01T00:00:00.000Z"
      },
      proposedBy: "AGENT",
      reasoning: "Increase power to maintain RoR",
      status: "COMPLETED",
      createdAt: "2025-01-01T00:00:00.000Z",
      approvedAt: "2025-01-01T00:00:30.000Z",
      executionStartedAt: "2025-01-01T00:00:31.000Z",
      executionCompletedAt: "2025-01-01T00:00:33.000Z",
      executionDurationMs: 2000,
      outcome: {
        status: "SUCCESS",
        message: "Power level changed successfully",
        actualValue: 80,
        telemetryChanges: {
          gasPct: 80,
          powerPct: 80
        }
      }
    });

    expect(proposal.status).toBe("COMPLETED");
    expect(proposal.outcome?.status).toBe("SUCCESS");
    expect(proposal.outcome?.actualValue).toBe(80);
  });

  it("validates command execution result", () => {
    const result = CommandExecutionResultSchema.parse({
      commandId: "cmd-1",
      status: "ACCEPTED",
      message: "Command accepted by driver",
      executedAt: "2025-01-01T00:00:00.000Z",
      actualValue: 75
    });

    expect(result.status).toBe("ACCEPTED");
    expect(result.actualValue).toBe(75);
  });

  it("validates failed command execution result", () => {
    const result = CommandExecutionResultSchema.parse({
      commandId: "cmd-2",
      status: "FAILED",
      message: "Hardware communication timeout",
      executedAt: "2025-01-01T00:00:00.000Z",
      errorCode: "TIMEOUT"
    });

    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("TIMEOUT");
  });

  it("validates command approval request", () => {
    const request = CommandApprovalRequestSchema.parse({
      proposalId: "prop-1",
      command: {
        commandId: "cmd-1",
        commandType: "SET_FAN",
        machineId: "machine-1",
        targetValue: 8,
        timestamp: "2025-01-01T00:00:00.000Z"
      },
      reasoning: "Increase fan to prevent scorching",
      proposedBy: "AGENT",
      agentName: "sim-roast-runner",
      sessionId: "session-1",
      expiresAt: "2025-01-01T00:05:00.000Z",
      safetyChecks: {
        constraintsValid: true,
        stateValid: true,
        rateLimitValid: true,
        warnings: ["Fan change may affect RoR"],
        risks: [
          {
            level: "LOW",
            description: "Minor RoR fluctuation expected"
          }
        ]
      }
    });

    expect(request.safetyChecks?.constraintsValid).toBe(true);
    expect(request.safetyChecks?.warnings).toHaveLength(1);
    expect(request.safetyChecks?.risks[0]?.level).toBe("LOW");
  });

  it("validates command approval response", () => {
    const response = CommandApprovalResponseSchema.parse({
      proposalId: "prop-1",
      decision: "APPROVED",
      actor: {
        kind: "USER",
        id: "user-1",
        display: "Operator Bob"
      },
      timestamp: "2025-01-01T00:00:30.000Z",
      reason: "Safe to proceed, roaster state is valid"
    });

    expect(response.decision).toBe("APPROVED");
    expect(response.actor.kind).toBe("USER");
  });

  it("validates command batch", () => {
    const batch = CommandBatchSchema.parse({
      batchId: "batch-1",
      title: "Preheat sequence",
      description: "Standard preheat commands for Ethiopia roast",
      proposals: [
        {
          proposalId: "prop-1",
          command: {
            commandId: "cmd-1",
            commandType: "SET_POWER",
            machineId: "machine-1",
            targetValue: 100,
            timestamp: "2025-01-01T00:00:00.000Z"
          },
          proposedBy: "AGENT",
          reasoning: "Max power for preheat",
          status: "PENDING_APPROVAL",
          createdAt: "2025-01-01T00:00:00.000Z"
        },
        {
          proposalId: "prop-2",
          command: {
            commandId: "cmd-2",
            commandType: "SET_FAN",
            machineId: "machine-1",
            targetValue: 5,
            timestamp: "2025-01-01T00:00:00.000Z"
          },
          proposedBy: "AGENT",
          reasoning: "Medium fan for preheat",
          status: "PENDING_APPROVAL",
          createdAt: "2025-01-01T00:00:00.000Z"
        }
      ],
      status: "PENDING",
      createdAt: "2025-01-01T00:00:00.000Z"
    });

    expect(batch.proposals).toHaveLength(2);
    expect(batch.batchApprovalRequired).toBe(true);
    expect(batch.status).toBe("PENDING");
  });

  it("validates command constraints preset", () => {
    const preset = CommandConstraintsPresetSchema.parse({
      presetId: "preset-power-safe",
      name: "Safe Power Limits",
      commandType: "SET_POWER",
      constraints: {
        minValue: 0,
        maxValue: 100,
        rampRate: 5,
        requireStates: ["RUNNING", "PREHEATING"],
        minIntervalSeconds: 10
      },
      machineId: "machine-1",
      description: "Conservative power change constraints"
    });

    expect(preset.commandType).toBe("SET_POWER");
    expect(preset.constraints.maxValue).toBe(100);
    expect(preset.constraints.rampRate).toBe(5);
  });

  it("validates all command types", () => {
    const types = ["SET_POWER", "SET_FAN", "SET_DRUM", "ABORT", "PREHEAT", "CHARGE", "DROP"];

    types.forEach((type) => {
      const command = RoasterCommandSchema.parse({
        commandId: `cmd-${type}`,
        commandType: type,
        machineId: "machine-1",
        timestamp: "2025-01-01T00:00:00.000Z"
      });

      expect(command.commandType).toBe(type);
    });
  });

  it("validates all command statuses", () => {
    const statuses = [
      "PROPOSED",
      "PENDING_APPROVAL",
      "APPROVED",
      "REJECTED",
      "EXECUTING",
      "COMPLETED",
      "FAILED",
      "ABORTED",
      "TIMEOUT"
    ];

    statuses.forEach((status) => {
      const proposal = CommandProposalSchema.parse({
        proposalId: `prop-${status}`,
        command: {
          commandId: "cmd-1",
          commandType: "SET_POWER",
          machineId: "machine-1",
          timestamp: "2025-01-01T00:00:00.000Z"
        },
        proposedBy: "AGENT",
        reasoning: "Test",
        status,
        createdAt: "2025-01-01T00:00:00.000Z"
      });

      expect(proposal.status).toBe(status);
    });
  });
});

describe("command analytics schemas", () => {
  it("validates command metrics", () => {
    const metrics = CommandMetricsSchema.parse({
      startTime: "2025-01-01T00:00:00.000Z",
      endTime: "2025-01-01T01:00:00.000Z",
      totalCommands: 100,
      completedCount: 80,
      failedCount: 15,
      rejectedCount: 5,
      successRate: 0.8,
      failureRate: 0.15,
      rejectionRate: 0.05,
      avgExecutionDurationMs: 1500,
      p95ExecutionDurationMs: 3000
    });

    expect(metrics.totalCommands).toBe(100);
    expect(metrics.successRate).toBe(0.8);
    expect(metrics.avgExecutionDurationMs).toBe(1500);
  });

  it("validates timeseries metrics", () => {
    const timeseries = CommandTimeseriesMetricsSchema.parse({
      metric: "command_count",
      startTime: "2025-01-01T00:00:00.000Z",
      endTime: "2025-01-01T01:00:00.000Z",
      bucketSizeSeconds: 300,
      dataPoints: [
        {
          timestamp: "2025-01-01T00:00:00.000Z",
          value: 10
        },
        {
          timestamp: "2025-01-01T00:05:00.000Z",
          value: 15
        }
      ]
    });

    expect(timeseries.dataPoints).toHaveLength(2);
    expect(timeseries.metric).toBe("command_count");
  });

  it("validates command alerts", () => {
    const alert = CommandAlertSchema.parse({
      alertId: "alert-1",
      severity: "WARNING",
      alertType: "HIGH_FAILURE_RATE",
      title: "High failure rate detected",
      message: "Command failure rate exceeded 20% threshold",
      timestamp: "2025-01-01T00:00:00.000Z",
      machineId: "machine-1",
      metadata: {
        threshold: 0.2,
        currentRate: 0.25
      }
    });

    expect(alert.severity).toBe("WARNING");
    expect(alert.alertType).toBe("HIGH_FAILURE_RATE");
    expect(alert.machineId).toBe("machine-1");
  });

  it("validates command summary", () => {
    const summary = CommandSummarySchema.parse({
      pendingApprovals: 5,
      activeExecutions: 2,
      recentFailures: 3,
      last24Hours: {
        startTime: "2025-01-01T00:00:00.000Z",
        endTime: "2025-01-02T00:00:00.000Z",
        totalCommands: 200,
        successRate: 0.85,
        failureRate: 0.10,
        rejectionRate: 0.05
      },
      last7Days: {
        startTime: "2024-12-25T00:00:00.000Z",
        endTime: "2025-01-01T00:00:00.000Z",
        totalCommands: 1000,
        successRate: 0.90,
        failureRate: 0.08,
        rejectionRate: 0.02
      },
      activeAlerts: [],
      topCommandTypes: [
        {
          commandType: "SET_POWER",
          count: 50,
          successRate: 0.95
        }
      ],
      generatedAt: "2025-01-01T00:00:00.000Z"
    });

    expect(summary.pendingApprovals).toBe(5);
    expect(summary.last24Hours.totalCommands).toBe(200);
    expect(summary.topCommandTypes).toHaveLength(1);
  });

  it("rejects invalid success rate", () => {
    const result = CommandMetricsSchema.safeParse({
      startTime: "2025-01-01T00:00:00.000Z",
      endTime: "2025-01-01T01:00:00.000Z",
      totalCommands: 100,
      successRate: 1.5, // Invalid - must be 0-1
      failureRate: 0.15,
      rejectionRate: 0.05
    });

    expect(result.success).toBe(false);
  });

  it("validates propose command request", () => {
    const request = ProposeCommandRequestSchema.parse({
      command: {
        commandId: "cmd-1",
        commandType: "SET_POWER",
        machineId: "machine-1",
        targetValue: 75,
        timestamp: "2025-01-01T00:00:00.000Z"
      },
      reasoning: "Increasing power to reach target temperature",
      sessionId: "session-1"
    });

    expect(request.proposedBy).toBe("HUMAN"); // Default
    expect(request.approvalRequired).toBe(true); // Default
    expect(request.reasoning).toBe("Increasing power to reach target temperature");
  });
});
