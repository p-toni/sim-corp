# @sim-corp/schemas

Shared Zod + TypeScript schemas for Sprint 0. These schemas cover both the roaster/product surface and the kernel/agent interfaces so every package can rely on the same contracts.

## Contents

- `src/common`: scalar helpers (ISO timestamps, identifiers, bounded percentages, etc.).
- `src/domain`: roaster-facing types (telemetry, events, roasts, machines, cupping records).
- `src/kernel`: kernel abstractions (missions, agent traces, policy checks, evaluation artifacts).

## Usage

```ts
import { TelemetryPointSchema, type TelemetryPoint } from "@sim-corp/schemas";

const parsed: TelemetryPoint = TelemetryPointSchema.parse(payloadFromDriver);
```

Each schema is exported alongside its inferred TypeScript type so callers can share validation and compile-time safety.

## Development

```bash
pnpm --filter @sim-corp/schemas test   # run Vitest for this package
pnpm --filter @sim-corp/schemas build  # emit JS + d.ts into dist/
```

The package inherits strict compiler settings from the workspace `tsconfig.base.json`.
