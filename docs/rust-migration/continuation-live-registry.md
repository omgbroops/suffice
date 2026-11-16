# Experimental live run registry continuation

This follows `2a139be` and the saved-browser/native-host continuation. The actual
experimental desktop now dispatches live host admission and lookup through Rust.
Pi still executes provider streams, tools, approvals, extensions, MCP, retries,
compaction and durable session writes. This is an additional implemented boundary,
not a completed engine rewrite or a claim of whole-product performance gains.

## Authority and compatibility

`crates/suffice-live` is a dependency-free worker-local registry. It owns host
slots, saved/pending/canonical aliases, turn generations, admission, started/failed
state, settlement, retirement and shutdown. `crates/suffice-session-addon` exports
its versioned Node-API interface. The desktop injects it only for the experimental
Rust backend. The default route uses the tested JavaScript registry adapter;
restarting without the experimental selection restores that route.

The Rust route holds the only alias/busy/started decision state. JavaScript keeps
host callbacks, promises, selected UI state, event replay and approval payloads.
Atomic admission reserves aliases before host startup can yield. Stale generations
cannot bind or settle another turn. Retirement reserves aliases while disposal is
pending and retains cleanup ownership after reset fails. Native failure never
replays Send. Each registry has 16,384 slots, 65,536 aliases, 8 MiB of alias-key
bytes and 4,096 bytes per encoded ID; rejection leaves existing routes intact.

The adapter reversibly escapes exceptional JavaScript UTF-16 IDs. Numeric tickets
are checked before Node-API conversion can truncate/wrap them. A panic revokes
registry routes and stops new admission. Generation checks cover routing,
canonical binding and settlement. Ordinary Pi streaming callbacks remain scoped
to the existing host; protection against every hypothetical cross-turn callback
is not established by this controller change.

The shared addon loader serializes complete validation/require/postvalidation by
canonical module identity. It rejects untrusted preloaded CommonJS entries and
requires restart after changed/uncertain mappings. Any attempted native initializer
that fails permanently poisons that loader identity, including when CommonJS
removes its failed cache entry. Existing atomic artifact publication is retained.

## Verification

A frozen source oracle from `2a139be` matches both implementations across 164
ordered IPC/replay/host-call entries. The corpus includes duplicate and independent
Sends, alias adoption, failed first admission, controls and approval routing,
retirement, shutdown and retry. Independent review reproduced then verified fixes
for failed-disposal cleanup ownership and concurrent/canonical addon loading.

Real forked workers and `createSufficeSession` completed local scripted streaming
provider turns on both routes, with exactly one HTTP request each. Switching from
Rust to the default backend reopened the same synthetic journal without changing
its bytes. A final release WKWebView test clicked the actual visible Send control
and asserted the streamed assistant answer in the original Vite UI. It made no
paid provider request. Raw results are retained with the continuation receipts.

The core and real addon tests include 1,500 deterministic registry operations,
capacity reclamation, numeric coercion, failed native initialization, stale turn
settlement and panic revocation. Independent review also verified 452 distinct
production-length UTF-16 draft IDs. The production CLI dry-run package has 26 files,
contains only the existing 583,296-byte traversal addon, and includes neither the
experimental addon nor desktop bridge. Windows type-checking is not runtime
qualification.

Final current-source qualification before the registry checkpoint:

- Fresh renderer and serialized desktop: 136 passed, 3 platform/opt-in skips.
- Session differential, actual addon, bridge and preflight: 216 passed, 2 opt-in
  Wry skips. The separately enabled final full-Wry Send test passed too.
- Rust live core: 10 passed in debug and release; FFI panic circuit: 1 passed;
  Wry host: 22 passed. Formatting, Clippy and locked release builds passed.
- Independent review: 164 frozen trace entries identical, 452 UTF-16 draft IDs
  distinct, disposal-failure and concurrent-loader reproductions now pass.
- macOS observer: 7 method checks passed, independently re-audited. No paired
  performance result is asserted by these tests.

The first desktop run retained a failure in its source-as-script test fixture:
adding the real module import to the router made that fixture's `new Function`
invalid. The fixture now requires the actual ES module under Electron's Node
runtime; the full rerun passed. Earlier failed logs remain alongside the rerun.
The standalone addon Rust runner emits missing Node-API host-symbol diagnostics;
actual native behavior is exercised inside Node. Windows addon type-checking
passed before the final retirement additions and is not final runtime evidence.

Raw evidence and source/binary hashes: `measurements/live-registry-10/`.

## Matched workload instrumentation

The Wry host has an opt-in `--measure-fixture` path with enumerated, ordered
`ready`, `select`, `settings`, `pty` and `finish` actions over private stdin. It
requires receipts from the trusted application document; there is no general
script-evaluation command. Both apps execute the exact same fixture JavaScript
against the same 30-thread/1,000-message journal copies. The probe checks marker
999, visible OpenAI settings, visible terminal output and graceful cleanup.
Normal application launches do not enable these hooks.

The macOS accounting observer and paired harness are described in
[`macos-host-measurement.md`](macos-host-measurement.md). They include launchd-parented
WebKit services and retired-helper CPU through isolated kernel coalitions. All
samples and failures must be retained. A five-pair campaign and its analysis remain
separate work until actually recorded. macOS 26.5.2 is below the Electron package's
declared 27.0 floor, so direct-executable measurements there are diagnostic and
cannot qualify release acceptance. Source, installer, shared-runtime and complete
feature parity remain separate gates.

## Continuation boundaries

Rust receipt-file writing is a proposed next boundary only. Current first-party
serialization, cost/unknown-usage handling, receipt appends, Pi journal persistence,
provider execution, CLI, web UI and research runners remain in their existing
implementations. No schema migration, credentials, paid evaluation or publication
was introduced. Preserve all prior evidence and frozen research bytes.

Requested agents were Astra High for Rust state, actual cutover and independent
review, and Astra Medium for regression execution and measurement methodology.
Effective routing is unverified. Work stayed at depth one with disjoint ownership
and at most two concurrent source writers. See the retained raw receipts for the
exact source/binary hashes and platform limits of each check.
