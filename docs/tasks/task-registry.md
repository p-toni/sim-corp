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
**Evidence:** `pnpm --filter @sim-corp/ingestion test`, `pnpm --filter @sim-corp/roaster-desktop test` (offline env: vitest missing)

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
