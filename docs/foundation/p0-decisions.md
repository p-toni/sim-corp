# P0 Decisions — Pilot Choices

## Machines

- **Sample roaster (Driver #1): Aillio Bullet R1 V2**
  - Start read-only (“shadow” mode).
  - Later enable constrained writes with human approval.

- **Production roaster (Driver #2): Giesen W6A (PLC/Modbus TCP)**
  - Start read-only telemetry.
  - Writes follow once partners and safety constraints are in place.

## UI Footprint

- **Desktop only** (Tauri + React) for P0.
- No web admin UI in P0 (only what is necessary for kernel inspection).

## Broker Topology

- **Edge-only MQTT** for control path in P0.
- In Sprint 1, optional bridge to cloud NATS JetStream for analytics + replay.

## Auth & Identity

- **Clerk** for user auth & sessions.
- Agents & devices: keypairs + mTLS; kernel-centric identity and policy.
