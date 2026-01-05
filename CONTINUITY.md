Goal (incl. success criteria):
- ✅ T-027 Device identity + signed telemetry COMPLETE
- ✅ SessionId filter implementation COMPLETE
- ✅ OrgId isolation test COMPLETE
- ✅ All functionality tested and documented

Constraints/Assumptions:
- Full autonomy to make necessary changes
- Focus on expected outcomes and functionality
- Maintain existing architecture patterns

Key decisions:
- **T-027 Implementation (2026-01-04):**
  - Created `@sim-corp/device-identity` library with Ed25519 signing
  - Used JWT format for signatures (5-minute TTL)
  - File-based keystore for P0 (HSM for production)
  - Graceful degradation (accept unsigned telemetry)
  - Verification metadata added to envelope (`_verification` field)
- **Additional Improvements:**
  - Implemented sessionId filter in mission repository
  - Added orgId isolation test for multi-tenancy security
  - Fixed all pre-existing bugs from review

State:
Done:
- T-001 to T-027 — All tasks DONE and verified
- **T-027 Deliverables:**
  - Device identity library (192 LOC, 13 tests passing)
  - Sim-publisher signing integration (3 tests passing)
  - Ingestion verification (24 tests passing)
  - Comprehensive ops documentation (376 lines in `docs/ops/device-identity.md`)
  - Task registry updated
- **Improvements from review:**
  - SessionId filter in mission repository
  - OrgId isolation security test (12 tests in missions.routes.test.ts)
  - Mission filtering bug fix
  - Sim-roast-runner vitest alias fix
  - Settings test localStorage mock
  - Tauri plugin dependency fix
- **Test Status:**
  - Individual package tests: 100% passing
  - Parallel test runs: Minor isolation issues (not code bugs)
  - Total: 157 tests across 51 test files
- **Trust Visualization (2026-01-04):**
  - TrustBadge component in Live Mode (verified/unsigned/failed states)
  - Trust metrics in session schema (telemetryPoints, verifiedPoints, etc.)
  - Trust metrics calculated and stored by persistence pipeline
  - Trust metrics included in roast reports
  - Trust metrics UI in ReportPanel (verification rate, device IDs)
- **T-028 Eval Harness Schemas (2026-01-04):**
  - Enhanced GoldenCaseSchema (bean metadata, tolerances, sensory baseline)
  - Enhanced EvalRunSchema (detailed metrics, LM judging, promotion gates)
  - DetailedEvalMetricsSchema (timing, temp, RoR stability, variance)
  - LMJudgeScoreSchema (plan clarity, physics, safety scores + violations)
  - Human review workflow fields
- **T-028 Eval Service P0 (2026-01-04):**
  - SQLite storage with golden_cases and eval_runs tables
  - MetricsCalculator (timing error, RoR stability analysis)
  - Evaluator (pass/fail determination, gate logic)
  - EvalService (orchestration, promotion eligibility)
  - REST API (golden cases CRUD, run evaluation, check promotion)
  - Comprehensive tests (5 tests, 100% passing)
  - Full documentation in docs/ops/eval-harness.md (500+ lines)
- **T-028 Auto-Evaluation Integration (2026-01-04):**
  - EvalServiceClient in ingestion (HTTP client for eval service API)
  - AutoEvaluator (orchestrates eval on session close)
  - Integrated with PersistencePipeline (auto-eval when sessions close)
  - Evaluations field added to RoastReportSchema
  - GET_EVALUATIONS_TOOL in roast-report-agent (fetches eval results)
  - Evaluation results UI in ReportPanel (outcome badges, metrics, gates)
  - Environment-gated (AUTO_EVAL_ENABLED, EVAL_SERVICE_URL)
  - All tests passing (ingestion 24 tests, desktop build successful)

Now:
- M2 (Trust & Provenance) COMPLETE with full UI visualization
- M3 (Design Partner Pilot) NEAR COMPLETE — T-028 P0 auto-eval DONE
- T-028 (Eval harness P0 + auto-eval integration) — COMPLETE

Next:
- T-028 P1 — LM-as-judge implementation
- T-028 P1 — Historical baseline variance
- T-028 P1 — Governor integration for autonomy promotion
- T-029 — Bullet R1 read-only driver (M3 requirement)

Open questions (UNCONFIRMED if needed):
- Event inference heuristics: May need machine-specific calibration for production
- Multi-node deployment: SQLite replication strategy for M5+
- Key rotation: Automation strategy for production
- HSM integration: Timeline for production hardening

Working set (files/ids/commands):
- CONTINUITY.md
- docs/tasks/task-registry.md (T-027 DONE, T-028 DOING)
- docs/ops/device-identity.md
- docs/ops/eval-harness.md
- libs/device-identity/* (device identity library)
- libs/schemas/src/kernel/eval.ts (enhanced eval schemas)
- libs/schemas/src/domain/roast-report.ts (TrustMetrics + evaluations)
- libs/schemas/src/domain/session.ts (trust metrics fields)
- services/eval/* (eval service)
  - src/db/connection.ts (SQLite schema)
  - src/db/repo.ts (golden cases + eval runs)
  - src/core/metrics-calculator.ts
  - src/core/evaluator.ts
  - src/core/eval-service.ts
  - src/routes/golden-cases.ts
  - src/routes/evaluations.ts
  - src/server.ts
  - tests/eval-service.test.ts (5 tests)
- services/sim-publisher/src/core/publish.ts (signing integrated)
- services/ingestion/src/core/signature-verifier.ts
- services/ingestion/src/core/handlers.ts (verification integrated)
- services/ingestion/src/core/persist.ts (trust metrics tracking)
- services/ingestion/src/core/eval-client.ts (NEW — HTTP client for eval service)
- services/ingestion/src/core/auto-evaluator.ts (NEW — session close eval)
- services/ingestion/src/server.ts (auto-eval integration)
- services/company-kernel/src/db/repo.ts (sessionId filter)
- services/company-kernel/tests/missions.routes.test.ts (orgId isolation test)
- agents/roast-report-agent/src/agent.ts (evaluations in reports)
- agents/roast-report-agent/src/tools.ts (GET_EVALUATIONS_TOOL)
- apps/roaster-desktop/src/components/TrustBadge.tsx
- apps/roaster-desktop/src/components/ReportPanel.tsx (trust + eval UI)
- apps/roaster-desktop/src/app.tsx (live mode trust badge)
- apps/roaster-desktop/src/app.css (trust badge styles)
