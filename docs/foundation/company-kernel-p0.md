# Company Kernel P0 — Walking Skeleton

We do **not** need to build the whole company first.  
We need a thin **kernel** that:

- can run agent loops,
- knows about agents/tools/policies,
- traces everything,
- and can evaluate behavior.

## Scope (P0)

1. **Agent Runtime (loop library)**
   - Implements: Get Mission → Scan Scene → Think → Act → Observe.
   - Handles: context assembly, tool calls (MCP/OpenAPI), timeouts, retries, HITL checkpoints.
   - Emits: structured traces & logs.
   - P0 runtime supports API-only tools; any filesystem/shell/computer use runs inside a sandbox via SandboxRunner.

2. **Control-plane & Registry**
   - Stores: agents, tools, policies, versions, roll-out state.
   - Exposes APIs/CLI to register agents/tools, update policies, view status.

3. **Identity & Policy**
   - Agent and device IDs (keypairs, SPIFFE-like).
   - mTLS for device/edge.
   - Pre-execute policy checks: “Can this agent call this tool with this action/resource?”

4. **Observability**
   - OpenTelemetry traces: one trace per loop.
   - Metrics: success rate, latency, cost, policy violations.
   - Logs: structured; easy to correlate with traces & telemetry.

5. **Evaluation harness**
   - Golden cases for main flows.
   - LM-as-Judge where useful.
   - Promotion gates: L2→L3 only after evals pass.

6. **Digital Twin (stub)**
   - Minimal roast sim (charge→TP→FC→drop) for offline testing.
   - Used by the eval harness.

7. **Sandbox Runner interface (computer use)**
   - Launches isolated execution environments for missions that require a workspace.
   - Enforces resource limits, network allowlists, and per-mission tenancy boundaries.
   - Persists artifacts/traces outside the sandbox; no durable state inside.

## Key Interfaces

- **Mission intake**
  - `POST /missions { goal, constraints, context } -> { missionId }` 

- **Agent trace**
  - Structured records with:
    - missionId, loopId, step ("GET|SCAN|THINK|ACT|OBSERVE"),
    - inputs/outputs,
    - tool calls,
    - metrics, status.

- **Tool registration**
  - tools are not agents;
  - agents discover tools via the registry and receive scoped credentials.

- **Policy check**
  - `POST /policy/check { agentId, tool, action, resource } -> { allow|deny, reason }` 

- **SandboxRunner (high level)**
  - `POST /sandbox/run { missionId, agentRef, inputs, limits, networkAllowlist, secretsRef } -> { sandboxId, status }`
  - `POST /sandbox/stream { sandboxId } -> { logs, artifacts, status }`
  - `POST /sandbox/stop { sandboxId } -> { status }`

- **Signed telemetry envelope**
  - see `docs/engineering/contracts.md` for payload.
