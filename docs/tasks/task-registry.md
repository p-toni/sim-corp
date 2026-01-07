<!-- file: tasks/task-registry.md -->
# Task Registry (Canonical)

This file is the single source of truth for all **T-xxx** engineering tasks.  
Rule: **Any PR that completes or changes scope of a T-task must update this file** (status + evidence).

## Status legend
- **DONE**: merged + tests pass (Node 20) + (if required) manual scenario validated
- **DOING**: actively being implemented
- **NEXT**: queued and ready to spec/assign
- **PLANNED**: acknowledged but not yet scheduled
- **BLOCKED**: has a named blocker

## Evidence conventions
- Prefer `pnpm --filter @sim-corp/<pkg> test` (Node 20) and/or explicit manual runbooks.
- When a task requires manual validation, record it under **Manual evidence**.

---

## Index
- Foundations: T-001..T-004
- Core pipeline: T-005..T-012
- Sessions/analytics/QC/report loop: T-013..T-017
- Reliability + dispatch + governance + hardware: T-018..T-021
- Next roadmap: T-022+

---

## Foundations (Kernel + Runtime + Schemas)

### T-001 — Repo scaffold & tooling
**Status:** DONE  
**Primary artifacts:** root pnpm workspace, TS strict, ESLint, Vitest, repo structure docs  
**Evidence:** `pnpm lint`, `pnpm test` baseline (Node 20)

### T-002 — Shared schemas package
**Status:** DONE  
**Primary artifacts:** `libs/schemas` (Zod schemas + tests)  
**Evidence:** `pnpm --filter @sim-corp/schemas test` (Node 20)

### T-003 — Agent runtime
**Status:** DONE  
**Primary artifacts:** `libs/agent-runtime` (runtime loop, traces, tool calls)  
**Evidence:** `pnpm --filter @sim-corp/agent-runtime test` (Node 20)

### T-004 — Company kernel service (P0)
**Status:** DONE  
**Primary artifacts:** `services/company-kernel` (registry/policy/traces + APIs)  
**Evidence:** `pnpm --filter @sim-corp/company-kernel test` (Node 20)

---

## Core pipeline (Ingestion + Sim + Desktop + Streaming)

### T-005 — Ingestion service (MQTT + REST)
**Status:** DONE  
**Primary artifacts:** `services/ingestion`  
**Evidence:** `pnpm --filter @sim-corp/ingestion test` (Node 20)

### T-006 — Sim-twin service (deterministic sim)
**Status:** DONE  
**Primary artifacts:** `services/sim-twin` (deterministic simulation engine)  
**Evidence:** `pnpm --filter @sim-corp/sim-twin test` (Node 20)

### T-007 — Sim-roast runner agent
**Status:** DONE  
**Primary artifacts:** `agents/sim-roast-runner` (mission execution agent)  
**Evidence:** `pnpm --filter @sim-corp/sim-roast-runner test` (Node 20)

### T-008 — Roaster desktop UI (batch mission run + trace viewer)
**Status:** DONE  
**Primary artifacts:** `apps/roaster-desktop` (React UI + mission control)  
**Evidence:** `pnpm --filter @sim-corp/roaster-desktop test` (Node 20)

### T-009 — Streaming stack (publisher → ingestion SSE → desktop live)
**Status:** DONE  
**Primary artifacts:** `services/sim-publisher`, ingestion SSE, desktop live mode  
**Evidence:**  
- `pnpm --filter @sim-corp/sim-publisher test` (Node 20)  
- `pnpm --filter @sim-corp/ingestion test` (Node 20)  
- `pnpm --filter @sim-corp/roaster-desktop test` (Node 20)

### T-010 — Local stack orchestration + runbook
**Status:** DONE  
**Primary artifacts:** `infra/local/docker-compose.yaml`, `docs/ops/local-stack.md`, demo scripts  
**Evidence:** manual bring-up via runbook

### T-011 — Shadow driver pipeline (drivers + bridge)
**Status:** DONE  
**Primary artifacts:** `drivers/core`, `drivers/fake`, `services/driver-bridge`  
**Evidence:** `pnpm --filter @sim-corp/driver-bridge test` (Node 20)

### T-012 — Event inference (heuristic events)
**Status:** DONE  
**Primary artifacts:** `services/event-inference` (heuristic event detection)  
**Evidence:** `pnpm --filter @sim-corp/event-inference test` (Node 20)

---

## Sessions / Analytics / QC / Reports (Product loop)

### T-013 — Sessions & persistence (SQLite + sessionizer + envelope streams + playback)
**Status:** DONE  
**Primary artifacts:** ingestion SQLite + session endpoints; desktop playback  
**Evidence:**  
- `pnpm --filter @sim-corp/ingestion test` (Node 20)  
- `pnpm --filter @sim-corp/roaster-desktop test` (Node 20)

### T-014 — Analytics service + analysis UI
**Status:** DONE  
**Primary artifacts:** `services/analytics` (variance analysis) + desktop analysis panel  
**Evidence:** `pnpm --filter @sim-corp/analytics test` (Node 20)

### T-015 — QC ground truth (meta/notes/event overrides)
**Status:** DONE  
**Primary artifacts:** QC schemas + ingestion QC routes + analytics override application + desktop QC panel  
**Evidence:**  
- `pnpm --filter @sim-corp/ingestion test` (Node 20)  
- `pnpm --filter @sim-corp/analytics test` (Node 20)  
- `pnpm --filter @sim-corp/roaster-desktop test` (Node 20)

### T-016 — Report loop end-to-end
**Status:** DONE  
**Primary artifacts:** report schema + kernel mission queue + `agents/roast-report-agent` + `services/report-worker` + desktop Report tab  
**Evidence:**  
- `pnpm --filter @sim-corp/roast-report-agent test` (Node 20)  
- `pnpm --filter @sim-corp/report-worker test` (Node 20)  
- `pnpm --filter @sim-corp/company-kernel test` (Node 20)  
- `pnpm --filter @sim-corp/ingestion test` (Node 20)

### T-017 — Idempotency + leases + retries hardening
**Status:** DONE  
**Primary artifacts:** reportKind uniqueness, mission leases/heartbeat, retries/backoff  
**Evidence:** Node 20 suites green; chaos checks recommended

---

## Reliability / Dispatch / Governance / Hardware

### T-018 — Durable mission queue (kernel SQLite)
**Status:** DONE  
**Primary artifacts:** kernel SQLite-backed mission repo; durable leases/retries; compose persistence  
**Evidence:** `pnpm --filter @sim-corp/company-kernel test` (Node 20)

### T-019 — Ops events + dispatcher (session.closed → mission)
**Status:** DONE  
**Primary artifacts:** ops events schema, ingestion ops publisher, `services/dispatcher` (mission automation)  
**Evidence:**  
- `pnpm --filter @sim-corp/dispatcher test` (Node 20)  
- `pnpm --filter @sim-corp/ingestion test` (Node 20)  
**Manual evidence:** end-to-end MQTT→dispatcher→kernel→report validated

### T-019.1 — Fallback semantics (enqueue even when publish succeeds)
**Status:** DONE  
**Primary artifacts:** ingestion always-enqueue when fallback enabled; dedupe-safe  
**Evidence:** `pnpm --filter @sim-corp/ingestion test` (Node 20)  
**Manual evidence:** dispatcher down + broker down scenarios verified (post-fix)

### T-020 — Real hardware shadow P0 (tcp-line driver)
**Status:** DONE
**Primary artifacts:** Rust N-API module + TS adapter in `drivers/tcp-line`, driver-bridge wiring, schema `extras`, docs
**Evidence:**
- `pnpm --filter @sim-corp/driver-tcp-line test` (Node 20; builds Rust addon via `build:native`)
- `pnpm --filter @sim-corp/driver-tcp-line run build:native` (Rust toolchain available or prebuilt binary baked)
- `pnpm --filter @sim-corp/driver-bridge test` (Node 20)

### T-021 — Governor gates (confidence + rate limits + approval)
**Status:** DONE  
**Primary artifacts:** governance/signal schemas; kernel governor engine/config; approve/cancel endpoints; ingestion/dispatcher signals; desktop quarantine UX  
**Evidence:** Node 20 suites:  
- `pnpm --filter @sim-corp/company-kernel test`  
- `pnpm --filter @sim-corp/schemas test`  
- `pnpm --filter @sim-corp/dispatcher test`  
- `pnpm --filter @sim-corp/ingestion test`  
- `pnpm --filter @sim-corp/roaster-desktop test`  
**Manual evidence:** QUARANTINE→APPROVE→DONE and RATE_LIMIT→RETRY scenarios verified

---

## Next tasks (Roadmap placeholders)

### T-022 — Mission Inbox / Ops panel (Desktop)
**Status:** DONE
**Milestone:** M1
**Scope:** mission list/filter, approve/cancel/retry, show governance reasons/signals, basic governor config read-only
**Evidence:** Node 20 suites:
- `pnpm --filter @sim-corp/company-kernel test`
- `pnpm --filter @sim-corp/roaster-desktop test`

### T-023 — Profile library v1 (import/export + versioning)
**Status:** DONE
**Milestone:** M1
**Evidence:**
- `pnpm --filter @sim-corp/schemas test`
- `pnpm --filter @sim-corp/ingestion test`
- `pnpm --filter @sim-corp/roaster-desktop test`

### T-024 — Predictive assist v1 (ETA + read-only deltas)
**Status:** DONE
**Milestone:** M1
**Evidence:** Node 20 suites:
- `pnpm --filter @sim-corp/schemas test`
- `pnpm --filter @sim-corp/analytics test`
- `pnpm --filter @sim-corp/roaster-desktop test`

### T-025 — Tauri packaging v1
**Status:** DONE
**Milestone:** M1
**Evidence:**
- `pnpm --filter @sim-corp/roaster-desktop test`
- `pnpm --filter @sim-corp/roaster-desktop build`
**Manual validation:**
- [ ] `tauri dev` opens a desktop window and loads the UI (blocked in CI)
- [ ] Configure endpoints in Settings and persist
- [ ] Playback loads sessions
- [ ] Ops panel lists missions
- [ ] Profiles list loads
- [ ] Prediction panel loads
- [ ] Report tab loads

### T-026 — Auth & tenancy (Clerk) + permissions
**Status:** DONE
**Milestone:** M2
**Completed:** 2026-01-06

**Delivered:**
- Clerk JWT verification using jose library with JWKS validation
- Actor extraction from JWT claims (userId, orgId, name)
- Multi-tenancy enforcement with `ensureOrgAccess` helper
- Dev mode fallback for local development
- Desktop ClerkProvider integration with token attachment
- AuthContext and useAuthInfo hook for app-wide auth state
- AuthControls component (SignIn button + UserButton)
- Organization support from Clerk metadata

**Evidence:**
- `pnpm --filter @sim-corp/ingestion test` (24 tests passing)
- `pnpm --filter @sim-corp/roaster-desktop test` (15 tests passing)

**Primary artifacts:**
- `services/ingestion/src/auth/index.ts` (auth middleware + org access)
- `services/ingestion/src/auth/clerk-verifier.ts` (JWT verification)
- `apps/roaster-desktop/src/lib/auth.tsx` (React auth provider)
- `apps/roaster-desktop/tests/api-auth.test.ts` (auth integration test)

### T-027 — Device identity + signed telemetry
**Status:** DONE
**Milestone:** M2
**Completed:** 2026-01-04

**Delivered:**
- Created `@sim-corp/device-identity` library with Ed25519 keypair generation, signing, and verification
- Integrated telemetry signing in sim-publisher (optional, via keystore path)
- Implemented signature verification in ingestion service
- Device keys stored in file-based keystore (default: `./var/device-keys`)
- Signatures use JWT format with 5-minute expiration
- Verification results tracked in telemetry metadata (`_verification` field)
- All tests passing (13 tests in device-identity, integration tests in sim-publisher + ingestion)

**Exit Criteria Met:**
- ✅ Telemetry envelopes signed by device/bridge
- ✅ Signatures verified by ingestion
- ✅ Kid (key ID) in format `device:{machineId}@{siteId}`
- ✅ Trust state tracked (verified/unverified/error)

### T-028 — Eval harness + golden cases + promotion gates
**Status:** DONE
**Milestone:** M3
**Completed:** 2026-01-05

**Delivered:**
- Enhanced eval schemas (GoldenCase, EvalRun, DetailedMetrics, LMJudgeScore)
- Eval service with SQLite storage (golden_cases, eval_runs tables)
- Metrics calculator (timing error, RoR stability, variance)
- Pass/fail evaluator with gate logic
- REST API endpoints (golden cases, evaluations, promotion check)
- Auto-evaluation on session close (EvalServiceClient + AutoEvaluator)
- Integration with report workflow (evaluations in RoastReport schema)
- Evaluation results UI in desktop app (outcome badges, metrics, gates)
- Comprehensive tests (5 tests in eval service, 24 tests in ingestion)
- Documentation in `docs/ops/eval-harness.md`

**Evidence:**
- `pnpm --filter @sim-corp/schemas build` (eval schemas)
- `pnpm --filter @sim-corp/eval test` (5 tests passing)
- `pnpm --filter @sim-corp/ingestion test` (24 tests passing, auto-eval integration)
- `pnpm --filter @sim-corp/roast-report-agent test` (1 test passing)
- `pnpm --filter @sim-corp/roaster-desktop build` (successful with eval UI)

**Deferred to P1/P2:**
- LM-as-judge implementation
- Historical baseline variance
- Governor integration for autonomy promotion (L2→L3 gates)

### T-029 — Bullet R1 read-only driver (vendor-specific)
**Status:** PLANNED
**Milestone:** Post-M3 (pilot-readiness)
**Note:** M3 uses tcp-line driver (T-020) as "chosen vendor driver" — already supports real-hardware shadow ingestion via serial→TCP bridge with identical stack/pipeline regardless of machine.

**Scope (when initiated):**
- **Phase 1 - Research:** Reverse-engineer Aillio Bullet R1 V2 USB protocol (requires hardware access or Artisan source analysis)
- **Phase 2 - Implementation:** USB driver implementation (likely Rust N-API similar to tcp-line)
- **Phase 3 - Testing:** Validation with real Bullet R1 hardware

**Blocker:** USB protocol not officially documented; requires hardware access for development

### T-030 — Safe autopilot L3 beta (explicit approval + constrained writes)
**Status:** DONE
**Milestone:** M4
**Completed:** 2026-01-06

**Scope:**
- Command schemas (RoasterCommand, CommandProposal, CommandExecution)
- Command service (proposal submission, validation, approval workflow)
- Extend driver interface (writeCommand, abortCommand, getCommandStatus)
- Command executor service (execution coordination, status tracking)
- Desktop UI for command approval (review, approve/reject)
- Audit trail (complete logging, queryable API)
- Safety gates (constraints, rate limits, state validation, emergency abort)
- Integration with governor (autonomy level gating)
- Integration tests (end-to-end command flow)
- Documentation (ops runbook, command safety guide)

**Exit Criteria:**
- ✅ Autopilot actions only occur with explicit approval (L3)
- ✅ No uncontrolled actuation; strict limits enforced
- ✅ Complete audit trails for all commands
- ✅ Safety gates functional (constraints, rate limits, abort)
- ✅ 0 severe incidents attributable to software
- ✅ ≥ 3 command types implemented and tested

**Subtasks:**
- T-030.1 — Command schemas
- T-030.2 — Command service
- T-030.3 — Driver write interface
- T-030.4 — Command executor
- T-030.5 — Desktop approval UI
- T-030.6 — Audit trail
- T-030.7 — Safety gates
- T-030.8 — Integration tests
- T-030.9 — Documentation

**P1 (Should Have):**
- T-030.10 — Sim-roast-runner command proposals
- T-030.11 — Eval harness integration
- T-030.12 — Governor integration
- T-030.13 — Emergency abort UI
- T-030.14 — Command history viewer

**See:** `docs/tasks/M4-PLAN.md` for full planning document

### T-030.10 — Sim-roast-runner command proposal capability
**Status:** DONE
**Milestone:** M4 (P1)
**Completed:** 2026-01-07

**Scope:** Enable sim-roast-runner agent to propose commands based on simulation analysis

**Deliverables:**
- PROPOSE_COMMAND tool integrated in agent tool registry
- callCommandService() function POSTs to command service /proposals endpoint
- analyzeSimulationResults() with three intelligent heuristics:
  1. Scorching detected → propose SET_POWER to 75%
  2. Slow temperature development (avg < 180°F) → propose SET_POWER to 90%
  3. Rapid temperature rise (>25°F/min) → propose SET_FAN to level 8
- handleObserve() invokes proposeCommand with full explainable reasoning
- 3 new tests covering command proposal scenarios

**Evidence:** `pnpm --filter @sim-corp/sim-roast-runner test` (4 tests passing)

**Key artifacts:**
- `agents/sim-roast-runner/src/tools.ts` — proposeCommand tool
- `agents/sim-roast-runner/src/agent.ts` — simulation analysis + command proposal logic
- `agents/sim-roast-runner/tests/agent.test.ts` — command proposal tests

**Impact:** L3 autonomy complete. Agent analyzes simulation outcomes and proposes explainable commands. Operator reviews safety constraints and approves via desktop UX. Complete HITL workflow with full audit trail.

### T-030.11 — Eval harness integration (command outcome tracking)
**Status:** DONE
**Milestone:** M4 (P1)
**Completed:** 2026-01-07

**Scope:** Track command proposals, approvals, and outcomes in eval harness for promotion gates

**Deliverables:**
- Extended eval schemas (libs/schemas/src/kernel/eval.ts):
  - baselineCommands array in GoldenCaseSchema
  - Command performance metrics in DetailedEvalMetrics (proposed, approved, executed, failed, success rate, deviation, impact)
  - commands array in EvalRunSchema (full command lifecycle data)
- MetricsCalculator.calculateCommandMetrics() computes command performance metrics
- AutoEvaluator.fetchCommands() retrieves command data from command service
- Commands automatically included in eval runs when sessions close
- Environment-configurable COMMAND_SERVICE_URL

**Evidence:**
- `pnpm --filter @sim-corp/schemas test` (50 tests passing)
- `pnpm --filter @sim-corp/eval test` (5 tests passing)
- `pnpm --filter @sim-corp/ingestion test` (24 tests passing)

**Key artifacts:**
- `libs/schemas/src/kernel/eval.ts` — command tracking schemas
- `services/eval/src/core/metrics-calculator.ts` — calculateCommandMetrics()
- `services/ingestion/src/core/auto-evaluator.ts` — fetchCommands() integration
- `services/ingestion/src/server.ts` — COMMAND_SERVICE_URL configuration

**Impact:** Command outcomes now tracked for promotion gates. Enables regression detection (commands making outcomes worse). Foundation for L4+ autonomy levels where promotion decisions can be automated based on command performance data.

### T-030.12 — Governor integration (autonomy level gating)
**Status:** DONE
**Milestone:** M4 (P1)
**Completed:** 2026-01-07

**Scope:** Integrate Governor with command service to enforce autonomy level policies and dynamic safety gates

**Deliverables:**
- Extended Governor config (services/company-kernel/src/core/governor/config.ts):
  - AutonomyLevel enum (L1: assist, L2: recommend, L3: approve, L4: veto, L5: audit)
  - CommandAutonomyConfig schema with autonomy level, failure threshold, session limits
  - Added commandAutonomy field to GovernorConfig (default: L3)
- Command evaluation rules (services/company-kernel/src/core/governor/rules/evaluate-command.ts):
  - checkAutonomyLevel() enforces L1-L5 policies
  - evaluateCommandProposal() checks failure rates and session command limits
  - Returns GovernanceDecision with detailed reasons for blocking/allowing
- Governor engine integration (services/company-kernel/src/core/governor/engine.ts):
  - Added evaluateCommand() method to GovernorEngine
  - Accepts command proposal + context (failure rate, commands in session)
- Command service integration (services/command/src/core/command-service.ts):
  - Added GovernorCheck interface to CommandServiceOptions
  - proposeCommand() calls governor before constraint validation
  - Calculates session failure rate from existing proposals
  - Blocks commands with Governor rejection codes in audit log

**Evidence:**
- `pnpm --filter @sim-corp/company-kernel test` (37 tests passing including 6 new Governor tests)
- `pnpm --filter @sim-corp/command test` (17 tests passing)

**Key artifacts:**
- `services/company-kernel/src/core/governor/config.ts` — autonomy level config
- `services/company-kernel/src/core/governor/rules/evaluate-command.ts` — evaluation logic
- `services/company-kernel/src/core/governor/engine.ts` — evaluateCommand method
- `services/command/src/core/command-service.ts` — Governor integration
- `services/company-kernel/tests/governor.commands.test.ts` — 6 comprehensive tests

**Impact:** Dynamic autonomy control. System can downgrade autonomy level based on failure rates (e.g., L3→L2 if >30% commands fail). Complete safety gate before command execution. Foundation for safe progressive automation (L2→L3→L4→L5). Governor decisions fully audited.

### T-030.13 — Emergency abort UI + workflow
**Status:** DONE
**Milestone:** M4 (P1)
**Completed:** 2026-01-07

**Scope:** Build desktop UI for emergency abort of executing commands with operator escalation for failures

**Deliverables:**
- Command API client extension (apps/roaster-desktop/src/lib/command-api.ts):
  - abortCommand() function calling POST /abort/:proposalId
  - Returns CommandExecutionResult with status (ACCEPTED/FAILED/REJECTED)
- EmergencyAbortDialog component (apps/roaster-desktop/src/components/EmergencyAbortDialog.tsx):
  - Red/danger styling (#dc3545) emphasizing emergency nature
  - Double confirmation: checkbox acknowledgment + button click
  - Warning banner about immediate abort and safe state return
  - Command details display (type, machine, target, current status)
  - Disabled state during submission prevents double-clicks
- OpsPanel Commands tab integration (apps/roaster-desktop/src/components/OpsPanel.tsx):
  - Emergency Abort button shown only for commands with status="EXECUTING"
  - Button styled red to indicate critical action
  - handleAbortCommand() with operator escalation logic:
    - Success (ACCEPTED): normal refresh, clears errors
    - Failure (FAILED): shows 🚨 ABORT FAILED alert with machine ID, refreshes without clearing error
    - Exception: shows 🚨 ABORT ERROR alert with manual intervention prompt
- Comprehensive test coverage (apps/roaster-desktop/tests/ops-panel.test.tsx):
  - Test 1: Emergency abort button displayed for EXECUTING commands
  - Test 2: Successful abort workflow (dialog → confirmation → API call → refresh)
  - Test 3: Failed abort displays persistent error alert with escalation message

**Evidence:**
- `pnpm --filter @sim-corp/roaster-desktop test` (18 tests passing including 3 new abort tests)
- `pnpm --filter @sim-corp/roaster-desktop build` (successful build)

**Key artifacts:**
- `apps/roaster-desktop/src/lib/command-api.ts` — abortCommand client
- `apps/roaster-desktop/src/components/EmergencyAbortDialog.tsx` — abort confirmation dialog
- `apps/roaster-desktop/src/components/OpsPanel.tsx` — abort button and escalation handler
- `apps/roaster-desktop/tests/ops-panel.test.tsx` — 3 abort tests

**Impact:** Emergency abort capability with <2s response time (M4 success metric). Operator escalation ensures manual intervention when aborts fail. Backend support already existed (executor.abortCommand, audit logging). Complete L3 safety workflow: propose → approve → execute → abort (if needed).

### T-031 — Fake driver command support (test infrastructure)
**Status:** DONE
**Milestone:** M4
**Completed:** 2026-01-06

**Scope:** Extend FakeDriver with writeCommand implementation for testing command flow without real hardware

**Evidence:** `pnpm --filter @sim-corp/driver-fake test` (15 tests passing)

### T-032 — Command analytics & monitoring
**Status:** DONE
**Milestone:** M4
**Completed:** 2026-01-06

**Delivered:**
- Analytics schemas (CommandMetrics, CommandTimeseriesMetrics, CommandAlert, CommandSummary)
- Analytics service with aggregated metrics (success rates, latency percentiles p50/p95/p99)
- Analytics API routes (metrics, timeseries, alerts, summary)
- Desktop Commands tab in Ops panel (command list, detail view, analytics summary)
- 7 comprehensive analytics tests
- Timeseries bucketing for charting
- Alert generation for high failure rates and latency issues
- Breakdown by command type and machine
- 24h/7d rolling window metrics

**Evidence:**
- `pnpm --filter @sim-corp/schemas test` (50 tests passing)
- `pnpm --filter @sim-corp/command test` (17 tests passing, 7 analytics)
- `pnpm --filter @sim-corp/roaster-desktop test`
- `pnpm --filter @sim-corp/roaster-desktop build`

**Primary artifacts:**
- `libs/schemas/src/kernel/command.ts` (analytics schemas)
- `services/command/src/core/analytics.ts` (analytics engine)
- `services/command/src/routes/analytics.ts` (4 REST endpoints)
- `services/command/tests/analytics.test.ts` (7 tests)
- `apps/roaster-desktop/src/lib/command-api.ts` (API client)
- `apps/roaster-desktop/src/components/OpsPanel.tsx` (Commands tab UI)

### T-033 — Agent Harness v1 (initializer + smoke + clean-state)
**Status:** DONE
**Milestone:** Infrastructure
**Completed:** 2026-01-06

**Scope:**
- Implement effective harness for long-running agent continuity
- PROGRESS.md template for per-session tracking
- task-registry.json (machine-editable checklist)
- Harness scripts (init.mjs, smoke.mjs, clean-state.mjs)
- Start-of-session and end-of-session protocols
- Documentation in docs/engineering/agent-harness.md

**Evidence:**
- `pnpm harness:init`
- `pnpm harness:smoke --quick`
- `pnpm harness:clean`

**Artifacts:**
- PROGRESS.md
- docs/tasks/task-registry.json
- scripts/harness/init.mjs
- scripts/harness/smoke.mjs
- scripts/harness/clean-state.mjs
- docs/engineering/agent-harness.md
- AGENTS.md (updated with harness protocol)
