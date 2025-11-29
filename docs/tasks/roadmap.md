<!-- file: tasks/roadmap.md -->
# Roadmap (Milestones)

This roadmap is derived from the canonical foundation docs:
- MVP — Artisan.ts
- Vision — The Self-Building Company
- System Architecture — Autonomy Kernel
- Company Kernel P0 — Walking Skeleton
- P0 Decisions — Pilot Choices

## Principles
- **Autonomy first, product always:** autonomy must visibly improve product outcomes.
- **Simulation-first:** no autonomy promotion without sim + gated evaluation wins.
- **Trust is a feature:** provenance, auditability, and reversibility are product pillars.
- **Local-first posture:** degrade gracefully when infra is unavailable.

---

## Milestone M0 — “Autonomy Backbone + Roast Loop” (DONE)
**Outcome:** a governed, durable mission runtime + roast data loop that can ingest (sim + real shadow), sessionize, analyze, QC, and generate reports.

**Delivered by:** T-001 .. T-021 (see `tasks/task-registry.md`)

**Exit evidence:**
- Node 20 test suites green across kernel/ingestion/desktop/agents/services
- Manual: dispatch, fallback, quarantine approval, rate-limits, report generation

---

## Milestone M1 — “MVP Alpha: Usable Roasting Instrument”
**Goal:** Artisan.ts becomes usable day-to-day: profiles, playback, guidance, ops visibility, packaged desktop.

### Scope (planned tasks)
- **T-022 Mission Inbox / Ops Panel (Desktop)**
- **T-023 Profile library v1**
- **T-024 Predictive assist v1 (read-only)**
- **T-025 Tauri packaging v1**
- (Optional) offline caching improvements piggybacked on Tauri packaging

### Exit criteria
- Desktop is packaged (Tauri) and usable without dev tooling
- Profile library supports versioning + import/export with a clean UX
- Predictive assist produces bounded, explainable suggestions (no actuation)
- Operator can resolve QUARANTINE/RETRY issues from UI (no curl required)

---

## Milestone M2 — “Trust & Provenance: Auth, Tenancy, Signed Telemetry”
**Goal:** enforce *who can do what*, and prove *where telemetry came from*.

### Scope (planned tasks)
- **T-026 Clerk auth + tenancy + permissions** (approve QC/missions gated by role)
- **T-027 Device identity + signed telemetry** (kid/sig + verification + UI surfacing)
- (Optional) Policy enforcement hardening across tool calls

### Exit criteria
- Approvals, QC edits, and mission controls require authenticated, authorized users
- Telemetry envelopes are signed by device/bridge and verified by ingestion
- “Trust state” is visible in desktop and report outputs

---

## Milestone M3 — “Design Partner Pilot: Real Driver + Eval Harness”
**Goal:** onboard 2–3 design partners and collect measurable uplift.

### Scope (planned tasks)
- **T-028 Eval harness + golden cases + promotion gates**
- **T-029 Bullet R1 read-only driver** (or chosen vendor driver)
- Predictor calibration improvements (if needed for pilot)

### Exit criteria (from MVP doc)
- Variance reduction for time-to-FC/drop measurable on pilot SKUs
- Eval coverage ≥ 70% of critical flows
- Stable onboarding/runbooks for partners

---

## Milestone M4 — “Safe Autopilot L3 Beta (Actuation with Approval)”
**Goal:** constrained writes with explicit approval and complete audit trails.

### Scope (planned tasks)
- **T-030 Safe autopilot L3** (commands + constraints + HITL)
- Audit + rollback semantics for actions
- Safety gates tied to eval harness and canaries

### Exit criteria
- Autopilot actions only occur with explicit approval (L3)
- No uncontrolled actuation; strict limits and audit trails are complete
- Incidents attributable to software are prevented by gates and controls

---

## Milestone M5 — “GA Readiness”
**Goal:** operational maturity: upgrades, backups, observability, portability.

### Likely scope
- OTel dashboards + SLOs + on-call runbooks
- Backup/restore + migration playbooks
- Data portability bundle + delete workflow
- Optional cloud replay pipeline (only if needed)

### Exit criteria
- Safe upgrades and tested recovery
- Rigor around incidents/change management
- Portability and ownership match the canonical vision

---

## How we plan sprints
- Keep active work in `tasks/sprints/` as small, reviewable increments.
- Every sprint references tasks by ID from `tasks/task-registry.md`.
