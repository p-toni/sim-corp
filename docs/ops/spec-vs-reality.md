<!-- file: docs/ops/spec-vs-reality.md -->
# Spec vs Reality (Canonical Alignment)

Purpose: keep the codebase aligned with the canonical documents by making drift explicit.  
This doc is *not* marketing; it’s an engineering truth table.

## Canonical docs (source of truth)
- MVP — Artisan.ts (Vertical 1 Launch)
- Vision — The Self-Building Company
- System Architecture — Autonomy Kernel
- Company Kernel P0 — Walking Skeleton
- P0 Decisions — Pilot Choices
- Contracts — HAL / Telemetry / Topics
- Vertical 1 — Specialty Coffee Roaster
- Agent Charters

---

## Snapshot: What exists today (T-001..T-021)
We have a functioning autonomy pipeline:
- durable mission queue (SQLite), leases/retries/idempotency
- MQTT ingestion + sessionization + persistence + SSE streams
- analytics + QC ground truth + report generation
- dispatcher from ops event `session.closed` plus fallback semantics
- governor gates: confidence quarantine, approvals, rate limits
- real telemetry on-ramp: native-backed tcp-line shadow driver (Rust N-API build or prebuilt index.node)

See: `tasks/task-registry.md`

Real tcp-line deployments need Node 20 plus a Rust toolchain during build (or a prebuilt `native/index.node` baked into the image).

---

## MVP — Artisan.ts (Vertical 1 Launch)

### Implemented
- [x] Live curves + event markers (live + playback) - `apps/roaster-desktop`
- [x] QC module linked to roasts (meta/notes + overrides persisted and applied) - `services/analytics`, `services/ingestion`
- [x] Variance/analysis outputs (analytics phase detection; warnings; recommendations) - `services/analytics`
- [x] Read-only guidance loop via reports (agent-generated report + next actions) - `agents/roast-report-agent`, `services/report-worker`
- [x] Shadow real telemetry path (tcp-line, Rust addon + TS adapter) and session-close automation - `drivers/tcp-line`, `services/dispatcher`

### Partial
- [~] RoR stabilization aids (some analysis exists; not a dedicated RoR assistant UX) - `services/analytics`
- [~] Predictive assist (strong in sim; limited calibration for real roasts) - `services/analytics`
- [~] Profile library (not first-class yet; needs versioning + import/export UX)

### Missing (as written in canon)
- [ ] Local-first runtime: "works offline, signed telemetry, reversible actions"
  - Signed telemetry is not yet implemented (T-027)
  - Offline-first packaged runtime (Tauri + local services) is not complete (T-025)
- [ ] Profile library versioning + import/export UX (T-023)
- [ ] Cupping & sensory forms with Agtron capture (partial implementation only)

---

## Vision — The Self-Building Company

### Implemented (strong)
- [x] Visible mission loop in UI and traces (timeline/steps per mission) - `apps/roaster-desktop`, `services/company-kernel`
- [x] L2→L3 mechanics: quarantine + explicit approval is real - `services/company-kernel` governor
- [x] Autonomy KPIs are measurable (missions, approvals, retries, interventions) - `services/company-kernel`

### Partial / Missing
- [~] Simulation-first promotion gates exist conceptually, but eval harness is not formalized (T-028)
- [ ] Ethics & provenance: signed telemetry + device identity are not implemented (T-027)
- [ ] Reversible participation / portability bundle not implemented

---

## System Architecture — Autonomy Kernel

### Implemented
- [x] Ingestion bus (MQTT), envelope streams, event inference - `services/ingestion`, `services/event-inference`
- [x] Simulation engine (sim-twin) + publisher for synthetic telemetry - `services/sim-twin`, `services/sim-publisher`
- [x] Observability primitives (structured traces + metrics endpoints) and runbooks - `libs/agent-runtime`
- [x] Governor: policy-adjacent gates + rate limits + approvals - `services/company-kernel`

### Partial / Missing
- [~] Identity & policy enforcement (as mTLS/SPIFFE-like) not implemented
- [~] OpenTelemetry end-to-end not implemented (internal tracing exists in `libs/agent-runtime`)
- [ ] Model store + evaluation harness + golden cases system (beyond unit tests) missing (T-028)
- [ ] Edge runtime “offline-first agent execution + sync” missing

---

## Company Kernel P0 — Walking Skeleton

### Implemented
- [x] Agent runtime loop and tool invocation - `libs/agent-runtime`
- [x] Mission intake + trace emission + durable mission queue - `services/company-kernel`
- [x] Governance gating and safe claim behavior (skip blocked/quarantined) - `services/company-kernel` governor

### Missing / Partial
- [~] Identity & policy checks as a formal access-control system
- [ ] Evaluation harness with promotion gates (L2→L3 requires eval pass) (T-028)

---

## P0 Decisions — Pilot Choices

### Aligned
- [x] Desktop-only footprint (today: Vite/React app) - `apps/roaster-desktop`
- [x] Edge MQTT topology (local stack) - `infra/local/docker-compose.yaml`

### Not aligned yet
- [ ] Tauri packaging (explicit in canon) (T-025)
- [ ] Clerk auth (explicit in canon) (T-026)
- [ ] Vendor drivers: Bullet R1 / Giesen W6 read-only (canon-specific) (T-029)

---

## Contracts — HAL, Telemetry, Topics

### Implemented
- [x] MQTT topics and envelope-based ingestion - `services/ingestion`
- [x] Session IDs, event streams, and QC overrides are first-class - `services/ingestion`, `services/analytics`
- [x] "extras" map supported in telemetry points (driver-friendly extensibility) - `libs/schemas`, `drivers/tcp-line`

### Missing
- [ ] Signed telemetry (`kid` + `sig`) and verification pipeline (T-027)

---

## Vertical 1 — Specialty Coffee Roaster (Artisan.ts)

### Implemented
- [x] Core loop: capture → analyze → QC → report → learn - `services/ingestion`, `services/analytics`, `agents/roast-report-agent`
- [x] Reliability posture (durable queue, idempotency, retry/leases, runbooks) - `services/company-kernel`, `services/dispatcher`

### Partial / Missing
- [~] Control pillar: no actuation yet (expected, P0 is read-only)
- [~] Insight pillar: recommendations exist; predictive flavor/outcome mapping not implemented - `services/analytics`
- [ ] Consistency pillar: profile transfer, tolerances, env compensation not implemented (T-023)
- [ ] Sensory pillar: forms exist; calibration tooling and Agtron capture not implemented

---

## Agent Charters

### Implemented in software (partial)
- [x] Governor behaviors (gates/rate limits/approvals) - `services/company-kernel`
- [x] Builder/Operator behaviors exist as code + runbooks - `agents/sim-roast-runner`, `agents/roast-report-agent`
- [~] Scientist role is partially realized via sim-twin + analytics, but not via a full eval harness (T-028) - `services/sim-twin`, `services/analytics`

---

## The “next alignment” backlog (derived from gaps)
These map directly to roadmap milestones (see `tasks/roadmap.md`):

- T-022 Mission Inbox / Ops panel
- T-023 Profile library v1
- T-024 Predictive assist v1
- T-025 Tauri packaging v1
- T-026 Clerk auth + tenancy + permissions
- T-027 Device identity + signed telemetry
- T-028 Eval harness + golden cases + promotion gates
- T-029 Vendor driver P0 (Bullet R1 or chosen target)
