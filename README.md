# Self-Building Company — Artisan.ts

This repo is the **source of truth** for a self-building, agent-run company whose first product is **Artisan.ts** — an intelligent roasting platform for specialty coffee.

The company’s core value is **autonomous operation**:
- Agents plan → build → operate → learn.
- Humans set **intent, ethics, and capital**, not every keystroke.
- The same company kernel will power future verticals beyond coffee.

## What Codex is expected to build

1. A **company kernel** (agent runtime, registry, policy, eval, observability) that can:
   - run the loop: Get Mission → Scan Scene → Think → Act → Observe,
   - keep traces & metrics for every loop,
   - enforce identity & policy, and
   - gate autonomy based on evaluations.

2. The first product vertical: **Artisan.ts**, the world’s best roaster software:
   - desktop app (Tauri + React) for roaster operators,
   - time-series ingest & storage (Postgres + Timescale),
   - device drivers (Aillio Bullet R1, Giesen W6 via Modbus TCP, starting read-only),
   - basic digital twin for roast simulation,
   - evaluation harness to measure improvement (variance, FC/drop timing, etc.).

## How to read this repo

Before writing code, read:

- `docs/foundation/vision.md` 
- `docs/foundation/system-architecture.md` 
- `docs/foundation/company-kernel-p0.md` 
- `docs/foundation/mvp-artisan.md` 
- `docs/foundation/vertical-coffee-roaster.md` 
- `docs/foundation/agent-charters.md` 
- `docs/foundation/p0-decisions.md` 
- `docs/engineering/llm-coding-rules.md` 
- `docs/engineering/contracts.md` 
- `docs/engineering/repo-structure.md` 
- `docs/engineering/eval-and-autonomy.md` 
- `tasks/sprint0.md` 

These are **constraints**, not suggestions.

## High-level tech choices

- Language: **TypeScript** for most services; **Rust** where tight device I/O is needed.
- UI: **Tauri + React** desktop for P0 (no web admin yet).
- Message bus: Edge-only **MQTT** for control path in P0; later bridge to cloud **NATS JetStream** for analytics.
- DB: **Postgres + TimescaleDB** for time-series.
- Auth: **Clerk** for human users; keypairs + mTLS for agents/devices.
- Observability: **OpenTelemetry** traces/metrics/logs → Grafana stack.

## What “good” looks like

- Clean, strongly-typed boundaries.
- Small, testable modules.
- Agentic patterns (loops, traces) visible in code.
- Evaluations exist for critical behaviors, not as an afterthought.
- Easy to extend to new roaster models and new verticals.

See `docs/engineering/llm-coding-rules.md` for detailed agent-facing rules.
