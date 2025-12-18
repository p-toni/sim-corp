# Tauri build + packaging (roaster-desktop)

`apps/roaster-desktop` now ships a Tauri shell that wraps the existing Vite UI. The bundle is **UI-only**; backend services still run via docker-compose or separate processes.

## Prerequisites
- Node 20 (repo engines + `.nvmrc`)
- pnpm installed
- Rust toolchain (`rustup` or system `cargo`) for Tauri + plugins
- macOS arm64 and Linux builds are the current focus; Windows should compile but is not hardened

## Commands
```bash
# Install dependencies (from repo root)
pnpm install

# Development shell: sync version -> start Vite on 5173 -> tauri dev window
pnpm --filter @sim-corp/roaster-desktop tauri:dev

# Production artifacts under apps/roaster-desktop/src-tauri/target
pnpm --filter @sim-corp/roaster-desktop tauri:build
```

The `tauri:dev` / `tauri:build` scripts call `src-tauri/sync-version.mjs` to keep `tauri.conf.json` and `Cargo.toml` versions aligned with `apps/roaster-desktop/package.json`.

## Runtime configuration
- Open the **Settings** tab in the app to set endpoints (persisted locally via `tauri-plugin-store`, with browser storage fallback for dev):
  - Ingestion: `http://127.0.0.1:4001`
  - Kernel: `http://127.0.0.1:4000`
  - Analytics: `http://127.0.0.1:4006`
  - Dispatcher (status only): `http://127.0.0.1:4010`
- The packaged UI does **not** rely on `.env` at runtime; endpoints are editable without rebuild.
- Security posture: shell allowlist disables shell execution, restricts HTTP scope to localhost, and adds a CSP limiting navigation to bundled assets plus localhost `connect-src` for API calls.

## Scope + non-goals
- v1 bundles **only** the UI. Services (ingestion/kernel/analytics/dispatcher/report-worker) must already be running.
- Auto-update and code-signing are not enabled; add platform-specific steps when needed.
- Build isolation: the Tauri build only needs the UI + shared libs (`libs/schemas`, `agents/sim-roast-runner`, `services/sim-twin`, `libs/agent-runtime`).

## Native addon awareness
`drivers/tcp-line` builds a Rust N-API addon for the driver bridge. The packaged desktop **does not** ship this driver in v1. Future work to bundle the driver must account for building and bundling the addon (Node 20 + Rust) alongside the app.
