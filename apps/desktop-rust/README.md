# Experimental Rust desktop host

This is an incomplete Windows-only transition experiment. It loads the built desktop renderer and delegates the existing Electron handlers and utility process to `apps/desktop-bridge/main.mjs`. It is not a replacement or parity claim. It requires WebView2 and explicit, disposable, non-overlapping absolute `--home` and `--profile` directories. Do not point either at existing user data: opening a Pi session can rewrite it. Run only against verified copies.

```powershell
cargo build --release --manifest-path apps/desktop-rust/Cargo.toml
apps/desktop-rust/target/release/suffice-desktop-rust.exe --root <absolute-repository> --node <absolute-node-24> --home <absolute-scratch-home> --profile <absolute-scratch-profile> --smoke
```

`--smoke` is deliberately specific to the migration fixture: it requires 30 rendered thread rows, selects `Rust host large transcript`, and checks for `Rust host fixture message 999` in the rendered transcript. It exits after five seconds on success, or reports failure and exits nonzero. It does not call a model. It is not a substitute for feature, security, accessibility, performance, or recovery testing.

The host serves `apps/desktop/dist` through a confined custom protocol, denies external navigation and popups, wraps the actual preload in a lexical shim, and proxies its messages to the bridge. It implements folder/file dialogs, save dialog, selected window operations, dragging, and credential-free HTTPS external links. Unsupported bridge operations fail explicitly. Known gaps include clipboard, image processing, message boxes, shell file operations, native resize, window lifecycle parity, message bounds/backpressure, and process-tree containment on forced termination. Shutdown requests bridge cleanup and then kills the direct child after a deadline; descendant cleanup under crashes or forced termination is not proven. Asset confinement and renderer isolation require independent security review before any production use. Node, the original renderer, and the Pi utility process remain non-Rust components.
