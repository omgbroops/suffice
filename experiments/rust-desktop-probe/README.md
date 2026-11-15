# Native desktop architecture probe

Standalone Windows-only Win32 experiment, not a replacement for the production app. It creates a native listbox and read-only multiline edit control with deterministic in-memory fixtures. It performs no provider or network calls and does not read user data. `--probe` opens a short-lived window, emits JSON after first paint, checks keyboard selection of thread 1 and programmatic selection of thread 29, compares full 1,000-line text, resizes and scrolls, waits four seconds for measurement, then closes. `--self-test` checks fixture and UTF-16 round trips. Normal mode opens the interactive window.

```sh
cargo build --release --offline --manifest-path experiments/rust-desktop-probe/Cargo.toml
cargo test --offline --manifest-path experiments/rust-desktop-probe/Cargo.toml
experiments/rust-desktop-probe/target/release/suffice-rust-desktop-probe.exe --self-test
experiments/rust-desktop-probe/target/release/suffice-rust-desktop-probe.exe --probe
```

The probe has no Markdown, mathematical rendering, terminal, production engine, screen reader verification, or end-to-end accessibility audit. Native controls alone do not establish accessibility parity. Window startup time and this fixture are not measurements of the full application.
