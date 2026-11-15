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
