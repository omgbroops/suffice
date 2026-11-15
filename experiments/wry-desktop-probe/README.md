# Wry architecture probe

This is a limited Windows WebView2 experiment, not the Suffice desktop product.
It displays the same 30 session labels and 1,000-line selected transcript as the
native Win32 probe. `--probe` verifies content selection, focus, scrolling,
resizing and timed shutdown with JSONL events. `ready` follows two animation
frames. Normal mode permits manual selection and scrolling.

```powershell
cargo build --locked --release --manifest-path experiments/wry-desktop-probe/Cargo.toml
experiments/wry-desktop-probe/target/release/suffice-wry-probe.exe --probe
```

The Rust host uses Wry 0.57.2 and Tao 0.37.1. The trusted inline HTML/CSS/JS fixture
uses WebView2, not a native Rust renderer. It denies new windows and permits
navigation only to about:blank or the exact fixture data URL. Each process has
an isolated temporary WebView2 profile; it never reads user sessions or auth.
A 30-second watchdog bounds automated probe failure. Profile directories remain
in the OS temporary directory for audit; no user profile is modified.

The initial failed probe is retained in `docs/rust-migration/measurements/`.
Its initial analysis described about:blank navigation; subsequent diagnostic
output established that WebView2 also navigates to a data URL for the exact
inline document. The narrow initial handler rejected it. The final handler
allows that exact fixture URL. Do not treat failed runs as startup performance.

Executable size excludes the shared WebView2 runtime, measured separately in
`footprint-final.json`. Process-tree memory includes observed WebView2 descendants
but can miss shared/reparented processes. This fixture lacks Markdown, code
highlighting, math, diagrams, terminals, agent streaming, real persistence and
provider integrations. It has no full-product parity or accessibility claim.
See [Wry's API documentation](https://docs.rs/wry/0.57.2/wry/) for the host/runtime
boundary; results here are measured locally, not library marketing estimates.
