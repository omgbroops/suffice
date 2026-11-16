# Matched macOS desktop measurements

This harness compares the directly executed packaged Electron app and the release Wry host on one interactive macOS machine. It runs the same renderer fixture against a fresh home and profile for each host. It measures the 30-thread sidebar, selection of the 1,000-message transcript through marker 999, the visible provider-settings panel, and a real visible terminal printing the fixture marker. Authentication, model inference, package size, accessibility and other desktop features need their own qualification.

## Prepare a frozen staging directory

Use a local path outside Desktop, Documents and Downloads that a transient GUI launch agent can access. An earlier launch from Downloads produced process IDs without usable windows. Stage a frozen source revision, its own frozen Bun dependencies and matching assets here. Keep the output directory outside all artifact trees. Use Node 24.22.2, Bun 1.4.4 and Rust 1.92.0.

```sh
cd "$stage"
bun install --frozen-lockfile
bun run desktop:build
node scripts/rust-migration/build-session-native.mjs
cargo +1.92.0 build --release --locked --manifest-path apps/desktop-rust/Cargo.toml
SUFFICE_INSTALLER_OUTPUT="$stage/release" node scripts/desktop/package.mjs --dir
SUFFICE_MACOS_ACCOUNTING_TEST=1 node --test scripts/rust-migration/macos-accounting.test.mjs
```

The accounting test launches a disposable sleep job and checks kernel membership and cleanup. The Wry build must include the opt-in `--measure-fixture` command and the exact staged `apps/desktop-rust/src/measure-fixture.js`. Both apps must contain the same built renderer tree. The runner compares its hashes before launch. It fingerprints both executable/runtime trees before and after the campaign, including the full first-party desktop tree and the sources imported by desktop handlers. Each symlink resolves to a file or directory visited by the same fingerprint. A broken link or an uncovered target fails the run. The receipt records the compiled accounting binary’s initial and final SHA-256, its byte length, compiler, SDK and flags. The input fingerprint reads warm the filesystem cache. Run without other builds or GUI test campaigns, on the same display and power settings, and retain the machine configuration.

## Run

```sh
node scripts/rust-migration/measure-macos-hosts.mjs \
  --root "$stage" \
  --electron-app "$stage/release/mac-arm64/Suffice.app" \
  --wry "$stage/apps/desktop-rust/target/release/suffice-desktop-rust" \
  --node "$(command -v node)" \
  --output "$results/new-desktop-pairs" \
  --pairs 5
```

The output parent must exist. The requested output directory must be new. Five to twenty pairs are supported, alternating the first host by pair. The harness records the installed OS and package’s `LSMinimumSystemVersion`. Direct execution below the declared floor is diagnostic. A hardware comparison on that machine cannot qualify installation on a supported release.

Each job starts its host directly. The external Node driver measures from immediately before `launchctl bootstrap` until it receives the rendered readiness receipt. Both renderers execute the same DOM checks. The measured viewport is 1440 × 900 CSS pixels and both runs must agree on device pixel ratio. Electron uses a private-profile, ephemeral loopback DevTools connection. macOS can initially clamp the app to its available work area. A temporary loopback main inspector first proves the launchd PID, Electron browser process type, and canonical scratch profile. The driver binds the renderer’s DevTools target to a unique BrowserWindow and webContents ID before it reads or changes native bounds. On an identity mismatch it disconnects its own socket and leaves the listener untouched. If needed, the driver adjusts the native minimum frame and content size by the CSS-pixel discrepancy, up to three times. It verifies 1440 × 900 at a stable device scale over three consecutive animation frames and confirms that the main inspector has closed before the first workload snapshot. The receipt retains the requested and observed bounds, frame samples and adjustment duration. Reported startup includes that entire adjustment. Wry uses its enumerated fixture commands over a private FIFO. Their observation and command-delivery overhead remains part of the reported latency.

The campaign records each phase result, three post-settle snapshots per phase, and the elapsed and CPU interval between adjacent snapshots. It retains raw failed accounting attempts, stdout, stderr, exit status and fixture hashes. Before and after each host, the runner hashes the shared synthetic project, including empty directories. Its tree must match the original fixture. After removing the job, the runner checks every observed PID and process start identity, including members seen only in rejected accounting snapshots or outside the expected coalition. It waits for exit or proves PID reuse without signaling that PID. Unresolved process, store or scratch cleanup and a changed shared project halt the campaign and preserve the affected fixtures. On success the scratch home and profile are removed, with the receipt-bound synthetic WebKit data store cleaned after its processes have exited. Failed samples retain their scratch paths for diagnosis. The runner leaves medians, paired deltas and acceptance decisions to the review of all receipts.

## Attribute the native process groups

On macOS, WebKit networking, GPU and content processes can all have launchd as their immediate parent. A distinct launchd resource coalition gives the observer an independent boundary for each app. The observer compares its membership against the jetsam coalition, responsible PID and process ancestry. The per-PID identity uses PID and process start time. A stable sample requires the before/after ledger member counts to agree with the enumerated PIDs and all member resource calls to succeed. [XNU coalition identity ABI](https://github.com/apple-oss-distributions/xnu/blob/ac9718fb1af618d5ce8678d0dc6e8a58f252216f/bsd/sys/proc_info_private.h) · [Resource and jetsam indices](https://github.com/apple-oss-distributions/xnu/blob/ac9718fb1af618d5ce8678d0dc6e8a58f252216f/osfmk/mach/coalition.h#L79)

Physical footprint is the kernel’s instantaneous sum of active members’ charged footprints. Summed resident bytes are reported separately and can include shared mappings in multiple processes. Cumulative coalition CPU includes retired helpers. CPU differences are converted with the local Mach timebase. A value of 100% uses one core over the measured interval. The samples cover kernel charges to the app. Universal services outside the coalition, including WindowServer, remain outside this accounting. The recorded snapshots provide sampled peaks, not continuous maxima. [XNU resource-usage structure](https://github.com/apple-oss-distributions/xnu/blob/ac9718fb1af618d5ce8678d0dc6e8a58f252216f/osfmk/mach/coalition.h#L113) · [Kernel ledger rollup](https://github.com/apple-oss-distributions/xnu/blob/ac9718fb1af618d5ce8678d0dc6e8a58f252216f/osfmk/kern/coalition.c#L792)

The observer uses private macOS accounting interfaces. An unavailable API, missing root identity, irreconcilable ledger or unknown member invalidates that sample. Preserve the failure and rerun the complete matched workload on a qualified system. A process-tree-only result can be reported with its omissions if full attribution remains unavailable.

A prior method probe on macOS 26.5.2 ran two Wry instances and an Electron instance simultaneously. Four observations separated the WebKit services of each Wry instance, excluded five pre-existing WebKit processes, and reconciled process counts to the kernel. A separate CPU fixture demonstrated that a child that exited between samples was still charged to the coalition. Those checks validate attribution only.
