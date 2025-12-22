Goal (incl. success criteria):
- Retroactively seed continuity system: CONTINUITY.md reflects repo evidence, AGENTS.md begins with continuity guidance, canonical task registry referenced, and a validation note is prepared.

Constraints/Assumptions:
- Follow README.md constraints and repository docs.
- Update CONTINUITY.md at start of turns and on state changes.
- Commit changes and run make_pr after committing.
- Keep changes minimal and scoped to docs/tracking.

Key decisions:
- Treat docs/tasks/task-registry.md as the canonical task registry because it exists and labels itself canonical; note mismatched references elsewhere (see Open questions).

State:
Done:
- T-001 DONE — repo scaffold & tooling (package.json, pnpm-workspace.yaml, docs/engineering/repo-structure.md).
- T-002 DONE — shared schemas package (libs/schemas).
- T-003 DONE — agent runtime (libs/agent-runtime).
- T-004 DONE — company kernel service (services/company-kernel).
- T-005 DONE — ingestion service (services/ingestion).
- T-006 DONE — sim-twin service (services/sim-twin).
- T-007 DONE — sim-roast runner agent (agents/sim-roast-runner).
- T-008 DONE — roaster desktop UI (apps/roaster-desktop).
- T-009 DONE — streaming stack (services/sim-publisher, services/ingestion, apps/roaster-desktop).
- T-010 DONE — local stack orchestration (infra/local/docker-compose.yaml, docs/ops/local-stack.md).
- T-011 DONE — shadow driver pipeline (drivers/core, drivers/fake, services/driver-bridge).
- T-012 DONE — event inference (services/event-inference).
- T-013 DONE — sessions & persistence (services/ingestion, apps/roaster-desktop).
- T-014 DONE — analytics service + UI (services/analytics, apps/roaster-desktop).
- T-015 DONE — QC ground truth (services/ingestion, services/analytics, apps/roaster-desktop).
- T-016 DONE — report loop end-to-end (agents/roast-report-agent, services/report-worker, services/company-kernel, services/ingestion).
- T-017 DONE — idempotency/leases/retries (services/company-kernel, services/report-worker).
- T-018 DONE — durable mission queue (services/company-kernel).
- T-019 DONE — ops events + dispatcher (services/dispatcher, services/ingestion).
- T-019.1 DONE — fallback semantics (services/ingestion).
- T-020 DONE — real hardware shadow P0 (drivers/tcp-line, services/driver-bridge).
- T-021 DONE — governor gates (services/company-kernel, services/ingestion, services/dispatcher, apps/roaster-desktop, libs/schemas).
- T-022 DONE — mission inbox/ops panel (apps/roaster-desktop, services/company-kernel).
- T-023 DONE — profile library v1 (libs/schemas, services/ingestion, apps/roaster-desktop).
- T-024 DONE — predictive assist v1 (libs/schemas, services/analytics, apps/roaster-desktop).
- T-025 DONE — Tauri packaging v1 (apps/roaster-desktop).
- T-026 DONE — auth & tenancy (services/ingestion, apps/roaster-desktop).
Now:
- None.
Next:
- None.

Open questions (UNCONFIRMED if needed):
- UNCONFIRMED: docs/ops/spec-vs-reality.md and docs/tasks/roadmap.md reference tasks/task-registry.md, but the file lives at docs/tasks/task-registry.md; TODO(@human) consolidate or add redirect.

Working set (files/ids/commands):
- CONTINUITY.md
- AGENTS.md
- docs/tasks/task-registry.md
- docs/ops/spec-vs-reality.md
- docs/tasks/roadmap.md
