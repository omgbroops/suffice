# Transitional desktop bridge

The bridge runs Suffice’s existing Electron main-process handlers under Node. The Rust host launches it via `apps/desktop-rust/start-bridge.mjs` with `SUFFICE_SESSION_BACKEND=rust`. The startup wrapper verifies the receipt-backed native reader for the selected Node executable. Use the [host instructions](../desktop-rust/README.md) to start the assembled desktop.

## Saved history

Ordinary list and open requests use the Rust reader before loading the live Pi worker. Compatibility reads for older or unusual journals use capability-verified source pages and the original Pi/desktop JavaScript projection. Browsing preserves journal bytes. Send validates the selected source, releases reader handles and hands the path to Pi. Model registry and status requests can also load Pi.

Catalog scans share a 256 MiB read budget across native and compatibility attempts, with limits of 50,000 directory entries and 10,000 candidate sessions. The sidebar uses the final 512 KiB within the same scan. The selected-source limits are 256 MiB per file, 64 MiB per record and 250,000 records. Deferred or oversized rows expose their state. Resume requires a complete qualified source.

## Host protocol

The bridge reads newline-delimited JSON on stdin and reserves stdout for protocol frames. With `--wait-for-host`, it emits `bootstrap-ready` and waits for `host-start` before loading desktop handlers. Rust negotiates `fragments-v1` at this gate. Renderer calls made before readiness receive an error. EOF or shutdown drains the owned workers and terminals.

Renderer replies and events carry opaque JSON in ordered base64 fragments of up to 768 KiB raw bytes. This preserves JSON escapes for unpaired UTF-16 code units as well as large image payloads. The host acknowledges executed fragments and binds replies to the originating document. The logical output queue has a 512 MiB byte cap. Individual renderer invocations have a 64 MiB limit.

The bridge forwards native service requests and waits for the host’s result. Root/guest WebView isolation, browser consent, profile activation, OS close handling and process supervision belong to the host. The CLI browser automation uses its own external browser context.

## Offline checks

From the checkout, use the pinned toolchains and frozen dependencies in the [local run guide](../../docs/rust-migration/local-run.md). Rebuild the addon before tests that exercise its real binding.

```sh
node scripts/rust-migration/build-session-native.mjs
node --test apps/desktop-bridge/*.test.mjs apps/desktop-bridge/test/*.test.mjs
```

For protocol fixtures without a Wry UI, the direct entry point accepts `--root` and `--profile` and requires an absolute `SUFFICE_HOME`. Use disposable absolute paths. Normal host launch inherits `PI_OFFLINE`; the migration smoke sets it to `1`.
