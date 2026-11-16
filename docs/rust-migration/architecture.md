# Architecture and migration boundaries

This branch is a partial migration. Electron, the web UI and Pi remain the
production desktop and agent engine. The accepted candidate is read-only
repository traversal implemented in Rust and loaded as an asynchronous Node-API
addon. It does not replace parsing, provider transport or session management.
See `delivery.md` for historical traversal measurements and `continuation-desktop-cutover.md` for the latest experimental host boundary and outstanding gates.

## What full Rust means

| Boundary | Completion requirement |
| --- | --- |
| First-party production code | Rust owns desktop host/UI, application state, agent loop, CLI, storage, tools, IPC, authentication adapters, subprocess lifecycle and current benchmark/reporting utilities. This branch does not meet this requirement. |
| Embedded runtimes | Explicitly enumerate and measure engines needed to execute user JavaScript, extension code and codemode. Embedding a JS engine can be compatible with a Rust host, but retaining Pi's Node agent loop is a hybrid implementation. |
| External user programs | Shells, Git, language tools and JavaScript benchmark subjects remain their original programs. Their tasks must not be translated to make a Rust benchmark easier. Measure optional browser/desktop automation separately. |
| Build-time tools | Cargo/Rust, Node/Bun/Vite, packaging utilities and platform SDKs are recorded separately. A Rust host with Vite-built UI still has a web UI; WebAssembly does not eliminate its browser runtime. |
| Historical evidence | Existing reports, frozen fixtures, patches, manifests and receipts remain unchanged, even when they contain JavaScript or depend on historical Node tooling. Preserve interpreter/version information to replay them. |

## Current implemented boundary

```text
Desktop web UI -> isolated Electron preload/main -> per-thread utility-process Pi
CLI -> Pi session and terminal UI
Both -> repositoryTools -> navigation -> filesIn
                                  -> optional Rust Node-API addon
                                  -> original JavaScript fallback
```

The addon receives an absolute traversal root and returns UTF-8 relative paths.
The JavaScript adapter preserves sibling `localeCompare` ordering and lexical
tie order. Rust skips dot entries, node_modules, symlinks and non-regular files,
uses heap-based DFS, and returns filesystem/encoding failures without writing
anything. The old JavaScript implementation remains the authoritative fallback.
After the edge-to-edge branch integration, production `repositoryPath` treats the
selected project as a working directory and resolves explicit task-directed local
paths beyond it. Tool access modes and approval wrappers still apply; this helper
is no longer a project confinement boundary. The native traversal adapter retains
its own ordered relative-output validation and JavaScript fallback. Research
workers remain separately isolated, and `SessionStore` authority remains confined
to its explicit session directory. See `edge-to-edge-integration.md`.

One operation per module/isolate may occupy a libuv worker. Concurrent callers
immediately use JavaScript so multiple native jobs cannot consume all default
libuv workers. Wide roots use at most four short-lived scoped Rust workers;
there is no permanent Rust worker pool or per-operation subprocess. Scoped
thread creation errors and caught traversal panics become rejected promises.
The adapter catches addon load/execution/validation errors and runs the existing
implementation. Missing/incompatible addons are cached as unavailable until a
process restart. A native allocation failure can still terminate a process;
native code increases the host's fault domain. Test and platform coverage matter.

Node-API level 6 supplies the typed `String -> Promise<Vec<String>>` boundary.
It avoids a Node module ABI-specific C++ addon. The shipped Windows artifact was
tested with Node 24.22.2 and Electron 45.3.0. Mac/Linux compilation and runtime
validation remain outstanding. This is an optimization of the existing runtime,
not a Rust CLI replacement.

## Desktop architecture experiment

`experiments/rust-desktop-probe` implements native Win32 list/edit controls in
Rust. `experiments/wry-desktop-probe` implements the same 30-thread, 1,000-line
read-only fixture with a Rust host and WebView2. Both verify selection, transcript
content, scrolling/resize behavior and shutdown through programmatic assertions.
The Wry fixture also verifies focus; neither is a screen-reader audit. They do
not read user sessions or credentials and are not packaged as the product.

The native prototype is the preferred next research direction because it avoids
the browser process tree, but it has not passed the full desktop gate. Native
Markdown, code highlighting, KaTeX-equivalent math, Mermaid-equivalent diagrams,
images, PTY rendering, keyboard behavior, accessibility and visual quality still
need compatible implementations and behavioral tests. The Wry prototype is a
useful host-footprint comparison; adopting it would retain a browser runtime.
The initial Wry navigation failure is retained as evidence. Neither prototype's
limited UI is a fair substitute for the full Electron workload.

## Pi replacement obligations

The experimental eframe saved-history path now uses `SessionStore` -> Rust Pi
projection -> Rust desktop presentation/saved usage -> native rendering. Private
compaction content and persisted reasoning follow their separate saved-view
suppression rules. Finite JSON parsing/formatting uses JavaScript number
conventions. See `continuation-saved-view.md` for direct Node-oracle evidence and
remaining semantic/platform gaps. The default production Electron path still uses Pi; the opt-in Rust saved-history path and experimental full-renderer host are described in `continuation-desktop-cutover.md`.

The installed Pi 1.5.2 source was inspected, including session-manager,
agent-session, model-runtime, auth-storage, resource-loader, project-trust,
extensions, MCP, codemode and the transitive Pi packages. See
`engine-inventory.md` for paths, events and test gaps. Existing trusted extensions
load Node built-ins, npm modules, TypeScript through jiti and native modules.
Their compatibility cannot be supplied by a generic JavaScript interpreter.
Codemode is separately isolated QuickJS WASM with proxied tools, worker limits,
interrupts, output paging and cancellation. Preserve both boundaries.

Before porting the loop, specify versioned Rust envelopes carrying request ID,
session/thread ID, monotonic per-thread sequence, event kind, payload and explicit
terminal error/cancellation state. Test ordering, stream backpressure, partial
output, steering, approvals, retry/compaction events, tool completion and shutdown
against saved Pi traces. Do not infer costs when usage is missing. Durable
receipts must retain serial append/flush/error behavior and unknown-cost events.
These Rust engine interfaces are proposed work, not implemented stubs.

## Persistence and rollback

No persisted-data format changed in the original traversal stage. The experimental session addon now reads explicitly granted session directories; browsing is read-only, and Send deliberately hands a validated location back to Pi. Original sessions, preferences, trust decisions,
credentials, receipts and view-state stores remain owned by the existing code.
Old Pi session open can rewrite v1/v2 data; compatibility tests must use independent
verified copies. Stop writers, snapshot the relevant directory, hash it, exercise
each implementation on separate copies, and verify backup restoration on another
copy before changing any user's sole data. Preserve new data before rollback.

Disable the optional addon by closing processes using it and moving its exact
`packages/cli/native/suffice-fs-PLATFORM-ARCH.node` file to a recoverable location.
Restart and verify the JavaScript fallback. No data restore is needed for this
stage. Retain the baseline source archive and SHA-256 manifest; never reset the
branch to perform rollback. The rejected process adapter is only experimental
evidence and is not a second production route.

## Retained non-Rust components

Electron/Chromium, the complete Vite web UI and presentation libraries, Node,
Pi AI/agent/TUI/MCP/codemode packages, QuickJS WASM, jiti, Acorn/TypeScript
stripping, node-pty/xterm, automation executables, and current research runners
remain. They supply unresolved features; removing them now would lose parity.
The addon itself uses napi/napi-derive and the Rust standard library, with pinned
Cargo locks. Windows PE import evidence records system APIs and VCRUNTIME140;
clean-machine CRT availability remains a packaging qualification gap. Addon load
failure preserves functionality by falling back.
