# MVP — Artisan.ts (Vertical 1 Launch)

## Goal

Deliver a production-ready release of **Artisan.ts** with:

- measurable roast quality uplift,
- improved consistency,
- and operator trust,

proving that the self-building company can autonomously ship, run, and learn.

## MVP Scope

- Live curve visualization (BT/ET/RoR).
- RoR stabilization aids (basic guidance).
- Event markers (charge, TP, FC, drop) with phase targets.
- Predictive assist:
  - ETA to FC/drop,
  - recommended adjustments (read-only suggestions at first).
- Profile library:
  - versioning, replay, CSV/JSON import/export.
- Cupping & QC module linked to roasts:
  - structured sensory notes,
  - variance dashboards.
- Local-first runtime:
  - works offline,
  - signed telemetry,
  - reversible actions,
  - audit trails.

## 0–90 Day Timeline (high level)

- **Day 0–30**
  - Company kernel walking skeleton.
  - Simulated roaster driver.
  - Basic digital twin.
  - MLP UI (desktop) showing live sim data.
  - First batch of golden cases & eval harness.

- **Day 31–60**
  - Bullet R1 driver (read-only).
  - TimescaleDB pipeline.
  - Predictor v2 (better FC/drop ETA).
  - Onboard 2–3 design partners.
  - Eval coverage ≥ 70% of critical flows.

- **Day 61–90**
  - Safe Autopilot beta (L2→L3 with explicit approval).
  - Real telemetry from Bullet R1 for pilot sites.
  - Twin v1.5 with more edge cases.
  - Ready for GA: SLOs, runbooks, on-call.

## Gates & Exit Criteria

- ≥ 20% reduction in variance (time-to-FC/drop) on target SKUs.
- +0.5–1.0 improvement in cupping scores vs. baseline (where measured).
- ≥ 40% of eligible tasks handled by agents with ≤ 5% required intervention.
- 0 severe incidents attributable to software.
- Audit trails complete for all autopilot actions.
