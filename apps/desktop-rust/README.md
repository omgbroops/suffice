# Experimental Wry desktop host

This source-built host runs Suffice’s Vite renderer in WKWebView on macOS and WebView2 on Windows. It runs the trusted desktop handlers through a Node bridge. Rust owns the native windows, OS integrations, process supervision and ordinary saved-history reads. Pi still owns live sessions, model calls and journal writes.

## Run locally

Use Node 24.22.2, Bun 1.4.4 and Rust 1.92.0. From the checkout on macOS, use an interactive desktop and fresh, non-overlapping home and profile directories.

```sh
bun install --frozen-lockfile
bun run desktop:build
node scripts/rust-migration/build-session-native.mjs
cargo +1.92.0 build --locked --release --manifest-path apps/desktop-rust/Cargo.toml
scratch=$(mktemp -d)
PI_OFFLINE=1 apps/desktop-rust/target/release/suffice-desktop-rust \
  --root "$PWD" --node "$(command -v node)" \
  --home "$scratch/home" --profile "$scratch/profile"
```

Normal launch inherits `PI_OFFLINE`. The command above sets it for local checks. The host selects `SUFFICE_SESSION_BACKEND=rust` and verifies the current Node platform’s addon, integrity receipt, licenses and reader export. For Windows commands and rollback, see the [local run guide](../../docs/rust-migration/local-run.md).

A kernel lock owns each canonical profile. Launching the same profile again activates its owner through an authenticated loopback channel. Login registration and project-window launch reuse the startup executable, Node binary, checkout, home and primary profile captured at launch. A project window shares the home and receives a profile under the primary profile’s `project-windows` directory.

## Native behavior

The trusted document receives the Suffice preload. The in-app browser uses a separate guest view without that preload or Node access. On macOS, the root and guest use distinct named WebKit data stores. The browser supports navigation, history, resizing, consented popups and Save As for the original download request, including authenticated POST responses.

Rust supplies clipboard file/image reads, thumbnail generation, icons, recoverable Trash, dialogs, cache clearing, startup registration and notification requests. OS close requests go through the desktop tray and shutdown preferences. Source-run notification delivery and clicks require a suitable application bundle and OS authorization. Restart-at-login and Windows runtime behavior still require platform checks.

Windows starts the bridge suspended and attaches it to a kernel Job. On macOS an independent guardian registers the bridge before user preloads and follows managed detached launches and PTY jobs. Native extensions or shell programs that create independent sessions fall outside that guarantee. LaunchServices applications retain their own lifecycle.

`--smoke` forces offline catalog behavior. It requires the seeded fixture with 30 threads and checks message 999 in the selected 1,000-message transcript. Use fresh verified copies for resume testing because Pi can upgrade older journals. The assembled macOS smoke and platform qualification limits are recorded in the [cutover report](../../docs/rust-migration/continuation-desktop-cutover.md).
