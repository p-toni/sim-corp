# Native dependencies and Node version

`better-sqlite3` is a native module used by `services/ingestion`. To build/run reliably:

- **Node version:** use Node 20.x (repo engines enforce `>=20 <21`; `.nvmrc` is set to `20`).
- **macOS:** install Xcode Command Line Tools (`xcode-select --install`).
- **Linux:** install build essentials (`build-essential`, `python3`, `make`, `g++`).
- **Windows:** install Visual Studio Build Tools (Desktop C++ workload) and ensure Python is available.

If native bindings fail to load, reinstall deps with Node 20 and the tools above:

```bash
pnpm install
```

In Docker, the local compose uses `node:20-*` images; ingestion mounts its DB at `./var/ingestion` by default.

## Rust-backed N-API modules

`drivers/tcp-line` builds a Rust native addon before running tests or publishing.

- Install the Rust toolchain (`rustup` or distro `rustc`/`cargo`) alongside Node 20.
- Build locally with `pnpm --filter @sim-corp/driver-tcp-line run build:native` (runs `cargo build --release`).
- For containers, use `node:20-bullseye` + `curl https://sh.rustup.rs -sSf | sh -s -- -y` (or distro cargo), then `pnpm i --frozen-lockfile` and `pnpm --filter @sim-corp/driver-tcp-line run build:native`; copy `native/index.node` into the final image or prebuild and bake it.
