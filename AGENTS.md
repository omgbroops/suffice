# Suffice project guidance

Suffice is an Electron desktop coding agent and Node CLI built around Pi 1.5.2.
The root `src/` implements separate research harnesses. Read implementation before
assuming that research behavior is production behavior.

## Boundaries

- `apps/desktop/electron`: trusted host, utility-process harness, IPC and stores.
- `apps/desktop/src`: sandboxed web UI; never expose credentials here.
- `packages/cli`: production options, tools, Pi integration and terminal UI.
- `packages/harness`: shared exports from the CLI, not an independent runtime.
- `src`, `scripts`, `tests`: research orchestration, policies and validation.
- `benchmarks`, `reports`, `research`, `reports.zip`: preserve frozen inputs and
  historical evidence byte for byte. JavaScript subject repositories stay JavaScript.
- `scripts/rust-migration`, `docs/rust-migration`: reproducible offline migration
  measurements, parity inventories and evidence. Do not overwrite earlier samples.
- `crates/suffice-session`: experimental read-only Pi/session presentation and
  saved usage, plus JavaScript-compatible finite JSON number handling; rebuild
  its executable before running the installed-Pi differential tests. New file-read
  integrations must retain `SessionStore` directory capabilities and enforce
  byte/line/catalog budgets, rather than reopen canonical ambient file paths.
- `apps/desktop-native`: experimental eframe viewer of synthetic sessions.
- `apps/desktop-rust`, `apps/desktop-bridge`: experimental Wry host and transitional
  Node business logic. Process containment currently requires Windows.

The imported edge-to-edge production file API intentionally treats the project
as a working directory for task-directed local access; preserve access-mode and
approval checks. This does not relax the separate session-store capability or
research-worker filesystem boundaries. New upstream capabilities and validation
are recorded in `docs/rust-migration/edge-to-edge-integration.md`.

## Verified baseline commands (Windows)

Use Node 24.22.2 and Bun 1.4.4, matching `.github/workflows/desktop.yml`.

```text
bun install --frozen-lockfile
bun run desktop:build
node --test tests/*.test.mjs packages/cli/test/*.test.mjs
node --test --test-concurrency=1 apps/desktop/test/*.test.mjs
node scripts/desktop/package.mjs
node scripts/desktop/smoke.mjs
```

The renderer build has passed locally. Baseline core/CLI tests have a Windows
oracle-audit failure; consult migration evidence before attributing it to changes.
There is no root lint or typecheck script. Tests named `live.mjs`, smoke-models,
preflight and experiment scripts may call paid providers; offline migration checks
must not run those indiscriminately. Use isolated `SUFFICE_HOME`, `PI_OFFLINE=1`
and separate Electron profiles for tests.

## Migration discipline

Work on `arya/rust-migration`. No push, publication, release or deployment is
authorized. Preserve unrelated work. The clean baseline is commit
`a5116549cf847d4e4e2d764b9d6300e7b5038633`; reproducibility and parity obligations
are in `docs/rust-migration/`.

Old Pi sessions can be rewritten on open. Use independent verified copies for
compatibility tests; never migrate the only copy. Keep trust, approvals, path
confinement, process cancellation, credential boundaries and unknown-cost semantics.
Do not promote a prototype on screenshot evidence or compare its limited feature
set with the full app as proof of equivalent performance.

Use independent discovery, implementation and verification agents where useful;
give each writer disjoint ownership. Keep depth one and at most four active agents
including the coordinator. Requested model routing is unverified unless runtime
metadata proves it. Prefer Terra Medium for bounded implementation and a separate
Sol High review for security or concurrency changes.

Done means parity and rollback checks, release builds, matched repeated performance
measurements including process trees, preservation checks, independent review and
an explicit account of retained non-Rust components. A partial migration stays
explicitly partial.

## macOS continuation

Use the same pinned Node/Bun/Rust versions above. Read the latest continuation
linked from `docs/rust-migration/active-work.md` for observed macOS failures and
qualification limits. The Windows baseline manifest contains CRLF checkout bytes;
macOS LF text can differ while preserving the identical historical Git blobs.
Report that distinction instead of rewriting evidence or normalizing the manifest.

Experimental offline checks (after frozen dependency installation):

```text
cargo build --locked --manifest-path crates/suffice-session/Cargo.toml
cargo test --locked --manifest-path crates/suffice-session/Cargo.toml
node --test crates/suffice-session/tests/*.test.mjs
cargo test --locked --manifest-path apps/desktop-native/Cargo.toml
cargo build --release --locked --manifest-path apps/desktop-native/Cargo.toml
node apps/desktop-native/smoke.mjs
node --test apps/desktop-bridge/*.test.mjs
```

Native viewer smoke needs an interactive desktop and synthetic fixtures only.
Headless egui input tests validate widget state, not OS presentation/accessibility.
