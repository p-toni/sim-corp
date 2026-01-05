# M4 Planning — Safe Autopilot L3 Beta

**Status:** PLANNING
**Milestone:** M4 (Safe Autopilot L3 Beta - Actuation with Approval)
**Created:** 2026-01-05
**Owner:** Engineering

---

## Mission Statement

Enable **constrained actuation with explicit human approval (L3)** while maintaining complete audit trails and zero uncontrolled actions. Move from L2 (recommend-only) to L3 (act with HITL approval) with comprehensive safety gates.

---

## Background

### Current State (Post-M3)
- ✅ M1: Mission Inbox + Profiles + Predictive Assist + Tauri
- ✅ M2: Trust & Provenance (signed telemetry, device identity, auth)
- ✅ M3: Eval harness + golden cases + vendor driver (tcp-line)
- **Current autonomy level:** L2 (recommend changes; humans apply manually)
- **Driver capabilities:** Read-only telemetry ingestion
- **Governance:** QUARANTINE gates + approval workflow for missions

### Autonomy Levels (Context)
- **L1** — Assist only (no direct actions)
- **L2** — Recommend changes; humans apply them ← **CURRENT**
- **L3** — Act with explicit approval (HITL) ← **M4 TARGET**
- **L4** — Act with veto (can act unless blocked)
- **L5** — Act with audit (no pre-approval, but full trace/audit)

---

## Goals & Success Criteria

### Primary Goals
1. **Extend driver interface** to support write operations (commands)
2. **Implement command approval workflow** with explicit HITL gates
3. **Complete audit trail** for all actuation (proposal → approval → execution → outcome)
4. **Safety constraints** preventing uncontrolled or dangerous actuation
5. **Rollback/abort semantics** for in-flight commands
6. **Integration with eval harness** to gate promotion based on outcomes

### Exit Criteria (from roadmap)
- ✅ Autopilot actions only occur with explicit approval (L3)
- ✅ No uncontrolled actuation; strict limits enforced
- ✅ Complete audit trails for all commands
- ✅ Safety gates tied to eval harness and canaries
- ✅ 0 severe incidents attributable to software
- ✅ Rollback/abort capabilities functional

### Metrics
- **Safety:** 0 commands executed without explicit approval
- **Auditability:** 100% of commands have complete traces (proposal → outcome)
- **Reliability:** < 1% command execution failures
- **Performance:** Command approval latency < 30s for operator review
- **Coverage:** ≥ 3 command types supported (e.g., power, fan, drum)

---

## Scope

### In Scope (M4)

#### 1. Command Schema & Infrastructure
- [ ] Command schemas (RoasterCommand, CommandProposal, CommandExecution)
- [ ] Command types (power level, fan speed, drum RPM - vendor-specific)
- [ ] Command constraints (min/max ranges, rate limits, safety bounds)
- [ ] Command lifecycle (proposed → pending_approval → approved → executing → completed/failed/aborted)

#### 2. Driver Write Interface
- [ ] Extend Driver interface with `writeCommand()` method
- [ ] Command validation at driver level
- [ ] Driver-specific constraint enforcement
- [ ] Command execution status reporting
- [ ] Abort/cancel command capability

#### 3. Approval Workflow
- [ ] Command proposal submission API
- [ ] Desktop UI for command review/approval
- [ ] Approval permissions (require auth + role)
- [ ] Approval timeout handling (auto-reject after X minutes)
- [ ] Bulk approval support (for sequences)
- [ ] Approval rejection with reason

#### 4. Audit Trail
- [ ] Command proposal logging (who, what, when, why)
- [ ] Approval decision logging (approver, timestamp, reason)
- [ ] Execution logging (actual command sent, response, timing)
- [ ] Outcome logging (telemetry changes, success/failure)
- [ ] Queryable audit log API

#### 5. Safety Gates
- [ ] Command constraint validation (ranges, dependencies)
- [ ] Rate limiting (max commands per minute/session)
- [ ] State validation (roaster must be in valid state)
- [ ] Integration with governor (check autonomy level, signals)
- [ ] Emergency abort capability
- [ ] Canary mode (test on subset before broader rollout)

#### 6. Agent Integration
- [ ] Extend sim-roast-runner with command proposal capability
- [ ] Command recommendation reasoning (explainable AI)
- [ ] Integration with predictive assist (ETA adjustments)
- [ ] Simulation-first validation (test in twin before proposing)

#### 7. Eval Harness Integration
- [ ] Command outcome tracking in eval runs
- [ ] Success/failure metrics for commanded sessions
- [ ] Promotion gates based on command performance
- [ ] Regression detection (commands making outcomes worse)

### Out of Scope (Future)
- ❌ L4 autonomy (act with veto) - deferred to post-M4
- ❌ L5 autonomy (act with audit only) - deferred to M5+
- ❌ Cloud-based command approval (desktop-only for M4)
- ❌ Multi-machine coordination (single roaster focus)
- ❌ Advanced prediction models for command optimization
- ❌ Continuous control loops (discrete commands only for M4)

---

## Architecture

### Command Flow (L3)
```
Agent (Reasoner)
  ↓ proposes command
Command Proposal Service
  ↓ validates constraints
Governor
  ↓ checks autonomy level + signals
Kernel (Mission Queue)
  ↓ status: PENDING_APPROVAL
Desktop UI (Operator)
  ↓ reviews + approves
Kernel (Mission Queue)
  ↓ status: APPROVED
Command Executor (new service)
  ↓ sends to driver
Driver (Bridge)
  ↓ writes to roaster
Roaster Hardware
  ↓ executes
Driver (Bridge)
  ↓ reads telemetry changes
Ingestion
  ↓ stores outcome
Audit Log
  ✓ complete trace
```

### New Components

#### 1. Command Service (`services/command`)
- **Responsibilities:**
  - Command proposal submission
  - Constraint validation
  - Proposal storage (SQLite)
  - Approval workflow orchestration
  - Execution coordination
  - Audit logging

#### 2. Command Executor (`services/command-executor` or extend driver-bridge)
- **Responsibilities:**
  - Approved command execution
  - Driver write interface
  - Execution status tracking
  - Abort/cancel handling
  - Telemetry correlation (command → outcome)

#### 3. Command Schemas (`libs/schemas`)
```typescript
// Command types
export const RoasterCommandSchema = z.object({
  commandId: z.string(),
  commandType: z.enum(["SET_POWER", "SET_FAN", "SET_DRUM", "ABORT"]),
  machineId: z.string(),
  targetValue: z.number().optional(),
  constraints: z.object({
    minValue: z.number().optional(),
    maxValue: z.number().optional(),
    rampRate: z.number().optional(), // max change per second
  }),
  timestamp: z.string(),
});

// Command lifecycle
export const CommandProposalSchema = z.object({
  proposalId: z.string(),
  command: RoasterCommandSchema,
  proposedBy: z.enum(["AGENT", "HUMAN"]),
  agentName: z.string().optional(),
  reasoning: z.string(), // explainable AI
  sessionId: z.string(),
  status: z.enum([
    "PROPOSED",
    "PENDING_APPROVAL",
    "APPROVED",
    "REJECTED",
    "EXECUTING",
    "COMPLETED",
    "FAILED",
    "ABORTED",
  ]),
  approvedBy: ActorSchema.optional(),
  approvedAt: z.string().optional(),
  rejectionReason: z.string().optional(),
  executedAt: z.string().optional(),
  completedAt: z.string().optional(),
  outcome: z.record(z.unknown()).optional(),
});
```

#### 4. Extended Driver Interface
```typescript
export interface Driver {
  // Read-only (existing)
  connect(): Promise<void>;
  readTelemetry(): Promise<TelemetryPoint>;
  disconnect(): Promise<void>;
  getStatus?(): unknown;

  // Write (NEW for M4)
  writeCommand?(command: RoasterCommand): Promise<CommandExecutionResult>;
  abortCommand?(commandId: string): Promise<void>;
  getCommandStatus?(commandId: string): Promise<CommandStatus>;
}

export interface CommandExecutionResult {
  commandId: string;
  status: "ACCEPTED" | "REJECTED" | "FAILED";
  message?: string;
  executedAt: string;
}
```

### Data Flow

1. **Proposal Phase:**
   - Agent/Human proposes command
   - Command service validates constraints
   - Governor checks autonomy level + signals
   - Proposal stored with status: PENDING_APPROVAL

2. **Approval Phase:**
   - Desktop UI shows pending command
   - Operator reviews reasoning + constraints
   - Operator approves/rejects
   - Decision logged with actor + timestamp

3. **Execution Phase:**
   - Command executor sends to driver
   - Driver writes to hardware
   - Execution status tracked
   - Telemetry changes monitored

4. **Audit Phase:**
   - Complete trace persisted
   - Outcome linked to command
   - Eval harness analyzes effectiveness
   - Governor may adjust autonomy based on results

---

## Task Breakdown

### T-030: Safe Autopilot L3 (Command Infrastructure)
**Status:** PLANNED
**Estimate:** Large (2-3 weeks)

#### Subtasks (P0 - Must Have)
1. **T-030.1** — Command schemas (RoasterCommand, CommandProposal, CommandExecution)
2. **T-030.2** — Command service (proposal submission, validation, approval workflow)
3. **T-030.3** — Extend driver interface (writeCommand, abortCommand)
4. **T-030.4** — Command executor service (execution coordination, status tracking)
5. **T-030.5** — Desktop UI for command approval (review, approve/reject)
6. **T-030.6** — Audit trail (complete logging, queryable API)
7. **T-030.7** — Safety gates (constraints, rate limits, state validation)
8. **T-030.8** — Integration tests (end-to-end command flow)
9. **T-030.9** — Documentation (ops runbook, command safety guide)

#### Subtasks (P1 - Should Have)
10. **T-030.10** — Sim-roast-runner command proposal capability
11. **T-030.11** — Eval harness integration (command outcome tracking)
12. **T-030.12** — Governor integration (autonomy level gating)
13. **T-030.13** — Emergency abort UI + workflow
14. **T-030.14** — Command history viewer in desktop

#### Subtasks (P2 - Nice to Have)
15. **T-030.15** — Bulk command approval
16. **T-030.16** — Command templates/macros
17. **T-030.17** — Predictive assist integration (suggest commands)
18. **T-030.18** — Command replay/undo (rollback)

### T-031: Fake Driver Command Support (Test Infrastructure)
**Status:** PLANNED
**Estimate:** Small (2-3 days)

Extend FakeDriver with writeCommand implementation for testing command flow without real hardware.

### T-032: Command Analytics & Monitoring
**Status:** PLANNED
**Estimate:** Medium (1 week)

- Command success/failure dashboards
- Command latency tracking
- Safety gate violation alerts
- Command outcome correlation with roast quality

---

## Safety Considerations

### Critical Safety Requirements
1. **No Bypass:** Commands MUST NOT bypass approval workflow
2. **Bounded Ranges:** All commands constrained to safe ranges
3. **State Guards:** Commands rejected if roaster state invalid
4. **Rate Limits:** Max N commands per time window
5. **Emergency Abort:** Always available, no approval required
6. **Audit Immutability:** Logs cannot be modified or deleted
7. **Rollback:** Ability to return to previous safe state

### Constraint Examples
```typescript
// Power level constraints
{
  commandType: "SET_POWER",
  constraints: {
    minValue: 0,     // 0% power
    maxValue: 100,   // 100% power
    rampRate: 5,     // max 5% change per second
    requireState: ["RUNNING"], // only when roaster running
  }
}

// Fan speed constraints
{
  commandType: "SET_FAN",
  constraints: {
    minValue: 1,     // minimum 1 (never fully off during roast)
    maxValue: 10,    // max 10
    rampRate: 1,     // max 1 level per second
    requireState: ["PREHEATING", "RUNNING"],
  }
}
```

### Abort Semantics
- Emergency abort bypasses approval (always allowed)
- Aborts logged in audit trail
- Abort attempts to return roaster to safe state
- If abort fails, escalate to operator with alarm

---

## Open Questions

1. **Command Granularity:** Should we support continuous control loops or discrete commands only for M4?
   - **Proposal:** Start with discrete commands, defer continuous control to post-M4

2. **Multi-step Sequences:** How do we handle command sequences (e.g., preheat → charge → roast)?
   - **Proposal:** Bulk approval for sequences, individual logging

3. **Partial Failures:** What happens if command is accepted but hardware fails to execute?
   - **Proposal:** Retry logic with exponential backoff, escalate to operator after N failures

4. **Command Versioning:** Do we need schema versioning for commands?
   - **Proposal:** Yes, include version in command schema for forward compatibility

5. **Cross-Machine Transfer:** Can command sequences be transferred across machines?
   - **Proposal:** Out of scope for M4, defer to future work

6. **LM-as-Judge for Commands:** Should command proposals be evaluated by LLM before approval?
   - **Proposal:** P1 feature, provide AI-assisted safety review

---

## Dependencies

### Internal Dependencies
- ✅ Governor framework (T-021) — approval workflow foundation
- ✅ Desktop UI (T-022) — approval interface
- ✅ Eval harness (T-028) — outcome tracking
- ✅ Device identity (T-027) — command attribution
- ✅ Vendor driver (T-020/T-029) — write interface target

### External Dependencies
- Hardware access for testing (real roaster or advanced sim)
- Vendor protocol documentation for write operations
- Safety review from roasting domain experts

---

## Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Uncontrolled actuation | CRITICAL | Low | Multi-layer approval gates, audit trails, rate limits |
| Hardware damage | HIGH | Low | Constrained ranges, state validation, emergency abort |
| Command bypass | CRITICAL | Medium | Immutable audit logs, permission enforcement, code review |
| Driver write bugs | HIGH | Medium | Extensive testing, fake driver impl, staged rollout |
| Operator approval fatigue | MEDIUM | High | Bulk approval, clear reasoning, trust building |
| Latency issues | MEDIUM | Medium | Async workflow, status updates, timeout handling |

---

## Success Metrics (M4 Exit)

### Safety Metrics (Must Pass)
- [ ] 0 commands executed without approval
- [ ] 0 uncontrolled actuations
- [ ] 0 severe incidents attributable to software
- [ ] 100% audit trail completeness

### Functional Metrics
- [ ] ≥ 3 command types implemented and tested
- [ ] Command approval latency < 30s (p95)
- [ ] Command execution success rate > 99%
- [ ] Emergency abort functional in < 2s

### Adoption Metrics
- [ ] ≥ 10 approved commands executed in pilot
- [ ] ≥ 1 design partner using L3 autopilot
- [ ] Operator feedback positive (NPS ≥ 7)

---

## Next Steps

1. **Review & Approve Plan** — Engineering + stakeholders sign off on scope
2. **Create T-030 in Task Registry** — Add detailed subtasks with estimates
3. **Schema Design** — Draft command schemas, review with team
4. **Fake Driver Prototype** — Implement writeCommand in FakeDriver for testing
5. **Desktop UI Mockups** — Design approval interface, get feedback
6. **Safety Review** — External review of constraints and abort logic
7. **Implementation Sprint** — Break into 2-week sprints, ship incrementally

---

## References

- [Roadmap](./roadmap.md) — M4 milestone definition
- [System Architecture](../foundation/system-architecture.md) — Autonomy levels
- [MVP Artisan](../foundation/mvp-artisan.md) — Product goals
- [Task Registry](./task-registry.md) — T-030 and related tasks
- [Governor Design](../ops/spec-vs-reality.md) — Approval workflow foundation
