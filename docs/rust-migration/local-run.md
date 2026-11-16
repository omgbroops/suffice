# Local build, packaging and rollback

Use Node 24.22.2, Bun 1.4.4 and Rust/Cargo 1.92.0. The historical Windows x64
installer checks used Visual Studio C++ build tools and the Windows SDK. PowerShell 7 is needed for the
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

## Experimental Rust desktop host

Build with the pinned Node and matching Rust architecture in the same checkout. The installed desktop dependencies and built renderer are prerequisites. macOS uses WKWebView. Windows requires WebView2.

```sh
bun install --frozen-lockfile
bun run desktop:build
node scripts/rust-migration/build-session-native.mjs
cargo +1.92.0 test --locked --manifest-path apps/desktop-rust/Cargo.toml
cargo +1.92.0 build --locked --release --manifest-path apps/desktop-rust/Cargo.toml
```

Launch on macOS with a fresh home/profile pair.

```sh
scratch=$(mktemp -d)
PI_OFFLINE=1 apps/desktop-rust/target/release/suffice-desktop-rust \
  --root "$PWD" --node "$(command -v node)" \
  --home "$scratch/home" --profile "$scratch/profile"
```

For a Windows source run after the same build, use PowerShell.

```powershell
$checkout = (Resolve-Path .).Path
$scratch = Join-Path ([System.IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
$env:PI_OFFLINE = '1'
& "$checkout/apps/desktop-rust/target/release/suffice-desktop-rust.exe" --root $checkout --node (Get-Command node).Source --home "$scratch/home" --profile "$scratch/profile"
```

Both examples explicitly select offline behavior. Normal Wry launch inherits the caller’s setting. The fixture-specific `--smoke` flag forces offline catalog behavior. Each canonical profile has one owner. Relaunching it activates that process. New project windows use canonical startup paths, the shared home and a separate child profile. Keep home and profile paths absolute and non-overlapping.

The host selects the Rust saved-session backend. Its matching addon, SHA-256 receipt and license bundle are generated under `apps/desktop-bridge/native/`. Rust checks session capabilities and versions and computes sidebar metadata during discovery. Legacy or unusual sessions use the original projection over verified source pages. Catalog work, including native read-ahead and compatibility reads, shares 256 MiB. A selected source is bounded at 256 MiB, 64 MiB per record and 250,000 records. Pi opens a validated path separately at Send, leaving a pathname race. ReFS uses 128-bit file identifiers while the current identity API exposes 64 bits.

To roll back the session backend, close the Wry host, unset `SUFFICE_SESSION_BACKEND` and launch the Electron desktop with an independent verified copy. Browse requires no schema conversion. Pi can upgrade old journals on resume. Preserve original copies and reconcile any new writes before restoring.

## Cutover verification

Use isolated absolute scratch homes for tests. The real session binding and installed-Pi oracle require both the native addon build above and the Rust core executable.

```sh
cargo +1.92.0 build --locked --manifest-path crates/suffice-session/Cargo.toml
node --test crates/suffice-session/tests/*.test.mjs crates/suffice-session-addon/tests/*.test.mjs
node --test apps/desktop-bridge/*.test.mjs apps/desktop-bridge/test/*.test.mjs
node --test apps/desktop-rust/start-bridge.test.mjs apps/desktop-rust/owned-process-hook.test.mjs
```

On macOS the assembled host smoke rendered all 30 rows and message 999 and preserved the fixture. Separate WKWebView runs covered isolated data stores, popup consent, POST downloads and opaque fragmented JSON carrying full images and unpaired UTF-16. The native relaunch fixture exercised a changed working directory and an empty startup PATH. The Node session run recorded 197 passes and one opt-in Wry UI skip. These receipts cover different entry points. Windows runtime, notification delivery and click handling, restart-at-login, accessibility, release packaging and matched whole-app performance measurements remain open. See the [cutover report](continuation-desktop-cutover.md).

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
The historical Windows package receipts and macOS source-host checks cover
different artifacts. Clean-machine CRT availability, signing/notarization and
installed-machine qualification remain outstanding.
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

### macOS process lifecycle for the experimental Wry host

The macOS host starts a separate guardian before Node executes any preload.
It prepends its Node process hook to existing `NODE_OPTIONS`. Ordinary children
inherit the bridge session. Detached Node launches and node-pty shells register
their own sessions before executing the requested program. A small process in
each session pins its identity while jobs survive. The guardian watches the host
lifetime pipe and bridge exit using kqueue. On shutdown it finds same-session
processes across terminal foreground/background groups, checks their start
identities, and signals using macOS process audit tokens. Opening an application
through LaunchServices leaves its normal system-managed lifetime intact.

This lifecycle covers the managed Node and terminal launch paths. Trusted native
extensions and shell commands can independently create new sessions, and macOS
permits a user to terminate the guardian itself. Windows uses a kernel Job Object.
The macOS checks below exercise host and bridge SIGKILL, graceful shutdown, a
detached subprocess from a user preload, Node fork IPC, a real interactive PTY,
an unrelated same-user sentinel, and the stale-identity signal guard.

```sh
node --test apps/desktop-rust/owned-process-hook.test.mjs
cargo test --locked --manifest-path apps/desktop-rust/Cargo.toml --example guardian_fixture
```
