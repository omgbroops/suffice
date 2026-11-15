# Local build, packaging and rollback

Verified platform: Windows x64, Node 24.22.2, Bun 1.4.4, Rust/Cargo 1.92.0,
Visual Studio C++ build tools and Windows SDK. PowerShell 7 is needed for the
peak-memory harness. `powershell.exe`/CIM supplies process-tree snapshots. No
account credentials or paid provider calls are needed for the checks below.

```powershell
bun install --frozen-lockfile
bun run native:build
bun run desktop:build
node --test packages/cli/test/native-files.test.mjs
node scripts/rust-migration/verify-installed.mjs .
bun run desktop
```

`native:build` compiles the locked release addon and copies the exact Cargo
dynamic library to `packages/cli/native/suffice-fs-win32-x64.node`, with a SHA-256
receipt. Generated binaries, receipts, Cargo targets and installers are ignored
by Git. A fresh checkout builds them locally; no native binary download occurs
at application startup. Source checkout CLI help/version remain:

```powershell
node packages/cli/bin/suffice.mjs --help
node packages/cli/bin/suffice.mjs --version
```

For actual tasks use the existing login/model/access workflows. The agent loop,
authentication and UI remain Pi/Node/Electron. `--max-cost` is API-equivalent
accounting after usage, not a guaranteed pre-spend ceiling. Live evaluation has
not been authorized with a new budget in this migration.

## Release checks and local artifacts

```powershell
cargo fmt --manifest-path crates/suffice-fs/Cargo.toml -- --check
cargo fmt --manifest-path crates/suffice-fs-addon/Cargo.toml -- --check
cargo clippy --locked --manifest-path crates/suffice-fs-addon/Cargo.toml --all-targets -- -D warnings
cargo test --locked --manifest-path crates/suffice-fs/Cargo.toml
cargo test --locked --manifest-path crates/suffice-fs-addon/Cargo.toml
node --test tests/*.test.mjs packages/cli/test/*.test.mjs
node --test --test-concurrency=1 apps/desktop/test/*.test.mjs
node scripts/desktop/package.mjs
node scripts/desktop/smoke.mjs
npm pack --dry-run --json
```

Installer builds compile the native addon before staging. Staging copies only
the current platform/architecture addon; both CLI file manifests include its
directory. `release/win-unpacked/Suffice.exe` and the Windows NSIS installer are
local artifacts, not published releases. The packaged smoke checks real saved
transcripts, providers, PTY marker output, Windows identity and native traversal
inside the installed Electron main process. `verify-installed.mjs` checks the
adapter and actual repository navigation tools without a provider.

CI now builds/formats/lints/tests the Rust boundary before the existing tests.
Only Windows was run here; macOS arm64, Linux, clean-machine CRT availability,
signing/notarization and installed-machine qualification remain outstanding.
Consult `delivery.md` for exact observed failures and reruns rather than assuming
every listed command passes on every platform.

## Reproduce measurements

Use the preserved clean baseline, a release addon and fresh output names. Close
builds and test campaigns first. Never overwrite prior raw measurements.

```powershell
node scripts/rust-migration/compare-walk.mjs --root BASELINE --candidate CURRENT --binary ADDON.node --output NEW-WALK.json
node scripts/rust-migration/measure-addon.mjs BASELINE CURRENT ADDON.node NEW-MEMORY.json
node scripts/rust-migration/measure-desktop.mjs BASELINE NEW-BASELINE.json BASELINE\release\win-unpacked\Suffice.exe
node scripts/rust-migration/measure-desktop.mjs CURRENT NEW-CURRENT.json CURRENT\release\win-unpacked\Suffice.exe
cargo build --locked --release --manifest-path experiments/rust-desktop-probe/Cargo.toml
cargo build --locked --release --manifest-path experiments/wry-desktop-probe/Cargo.toml
node scripts/rust-migration/measure-probes.mjs CURRENT NEW-PROBES.json
```

The probe workloads are explicitly narrower than the full app. WebView2 is an
OS-installed runtime: its binary size is not included in the Wry probe executable
size. Include its process tree and report shared-runtime disk separately.

## Verified rollback design

No persistence schema changes occur. Close processes using the addon, move its
exact `.node` file to a recoverable backup, restart, and rerun navigation checks.
The original JavaScript walk runs when the module is absent. Restore the file
and restart to re-enable Rust. The source archive and original implementation
remain available; avoid Git reset or user-data replacement. Rollback checks must
restore the same addon hash and leave sessions/preferences untouched.

For future schema changes, independently copy and hash sessions before opening
them with either implementation: Pi v1/v2 sessions may be rewritten on open.
Test migration and restore on copies first, retain an untouched backup and
reconcile any new data before replacing a user's store.
