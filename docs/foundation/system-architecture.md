# System Architecture — Autonomy Kernel

## Purpose

Provide the technical and organizational nervous system that lets agents discover, build, operate and learn across verticals.

## Core Agent Roles

- **Strategist:** chooses verticals, sets objectives, runs portfolio simulations.
- **Builder:** implements product features, integrations, hardware interfaces.
- **Operator:** cares about SLOs, rollouts, incidents, capacity, and cost.
- **Scientist (R&D):** builds models, evaluations, simulations (digital twin, Agent Gym).
- **Community:** grows adoption, manages partners, turns feedback into structure.
- **Governor:** enforces policy, identity, ethics, budgets, and autonomy promotion.

## Operating Loop

For any mission:

1. **Plan** — Strategist frames goal, constraints, expected value.
2. **Simulate** — Scientist + Builder run scenarios in the twin; Operator sets SLO guardrails.
3. **Ship** — Builder + Operator deploy via feature flags/canaries.
4. **Observe** — telemetry, user feedback, evaluator scores.
5. **Learn** — Scientist updates models/evals; Strategist updates bets.
6. **Automate** — Governor adjusts autonomy level where safe and useful.

## Autonomy Levels (L1–L5)

- L1 — Assist only (no direct actions).
- L2 — Recommend changes; humans apply them.
- L3 — Act with explicit approval (HITL).
- L4 — Act with veto (can act unless blocked).
- L5 — Act with audit (no pre-approval, but full trace/audit).

## Platform Components

- **Ingestion bus:** time-series + events + labels (MQTT edge; later NATS cloud).
- **Model store & eval harness:** versioned models, golden cases, drift checks.
- **Simulation engine:** physics (roast dynamics) + agent behavior + economic outcomes.
- **Observability:** OpenTelemetry traces/metrics/logs; red/green dashboards.
- **Edge runtime:** offline-first agent execution; conflict-free sync.
- **Integration layer:** roaster drivers (Bullet R1, Giesen W6/Modbus), import/export adapters, public APIs.

## R&D Department

**Mandate:** improve product performance and safe autonomy via better models, data, and evals.

**Programs:**
- physics-informed roast models (RoR stability, cross-machine transfer),
- data quality & labeling (sensory calibration, Agtron/color, goldens),
- digital twin & Agent Gym (synthetic edge cases, red-team scenarios),
- dynamic eval & model governance (drift detection, LM-as-Judge, promotion gates).

**Interfaces:** works closely with Strategist, Builder, Operator, Governor.

## Core Metrics

- learning velocity (cycles from idea → improved metric),
- shipped improvements/week,
- SLO adherence,
- autonomy coverage (% of work done by agents),
- partner NPS and incident rate.
