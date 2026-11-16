# Saved-history cutover and functional desktop host continuation

This is an experimental, incomplete Rust migration. The original Electron/Pi
production route remains available; the imported `experiment/edge-to-edge-chat`
commit `91646057d4a44b628aa9c164f374cadfb096328d` is retained through merge `75b76c4`.
Do not equate a functional Wry host with full Rust ownership or accepted footprint
improvement. The full definition and unchanged acceptance targets are in
[`architecture.md`](architecture.md) and [`gates.md`](gates.md).

## Implemented boundary

- `SUFFICE_SESSION_BACKEND=rust` routes saved list/open through a persistent
  capability-backed Node-API reader before loading the live Pi worker. Model
  registry/status requests can still load Pi. Normal Electron launch keeps the
  original backend; the experimental Rust host selects Rust explicitly.
- Rust owns directory/file capability checks, identity/version validation,
  ordinary saved projection, sidebar extraction and saved usage. Date coercion,
  ECMAScript numbers, malformed inputs and UTF-16 boxing have differential tests.
  V8's entire permissive legacy Date grammar is not claimed as native parity.
- Unusual, legacy, invalid-UTF-8 and nonrepresentable JSON uses capability-verified
  source pages and the original Pi/desktop JavaScript projection. This preserves
  functionality while making retained JavaScript ownership explicit. Reading
  never upgrades the source journal. Send consumes reader authority and only
  then opens the validated source through Pi; Pi still owns live execution,
  extensions, compaction and durable journal writes.
- Compatibility supports full 20 MiB image attachments across multiple turns and
  journals over 64 MiB. The selected-source limits are 256 MiB, 64 MiB per record
  and 250,000 physical records. Catalog work shares 256 MiB across native decoder
  reads (including failed attempts/read-ahead) and compatibility reads. The
  sidebar tail is derived in the same pass. Deferred/oversized rows remain
  visible with explicit state; no truncated projection is authorized for resume.
  Discovery still has 50,000 directory-entry and 10,000 candidate ceilings.
- The Node-to-renderer transport carries opaque JSON as ordered base64 fragments
  of at most 768 KiB raw bytes. Execution acknowledgments bound in-flight work;
  unpaired UTF-16 and a reply containing three 20 MiB images survive actual
  WKWebView delivery. Queued logical output is capped at 512 MiB, and individual
  renderer invocations retain their 64 MiB limit. Replies bind to document IDs
  so a reload cannot apply an older request's error to a reused request ID.
- The full Vite renderer runs through Wry on macOS and the existing Windows path.
  Windows uses a kernel Job Object. macOS uses an independent event-driven
  guardian that enrolls Node before user preloads and follows managed detached
  children, fork IPC and real foreground/background PTY jobs. Identity-checked
  cleanup continues after an individual denied signal. This is managed process
  lifecycle coverage, not containment of arbitrary trusted native extensions.
- The in-app browser is a real isolated native view, not an iframe. Both Electron
  and Wry support address/history/reload/resize/hide/close, consented native
  popups preserving opener/postMessage/cookies, and Save As on the original
  download request preserving POST/cookies. Guests receive no Suffice preload,
  IPC or Node access. WebKit uses distinct named data stores for root and guest
  profiles, with cross-process restart tests. The existing CLI browser automation
  remains a separate external browser context.
- Rust OS adapters provide clipboard files/images, bounded thumbnails, native
  file icons, recoverable Trash, startup registration, project-window launch,
  asynchronous cache clearing and notifications. The bridge awaits the actual
  native completion. Source launches need an application bundle and OS permission
  for notifications; delivery/click, restart-at-login and Windows execution remain
  platform qualifications. A pasted FIFO is skipped without blocking on open.
- A kernel lock owns each canonical profile; a bounded, authenticated loopback
  channel activates the existing owner. Stale endpoints cannot claim ownership.
  Native OS close requests use the original tray/flush/shutdown preferences.
  Normal launch inherits the caller's network settings; smoke forces offline
  catalog behavior. No paid provider evaluation was run.

## Evidence and qualification

Raw continuation logs are retained under
`measurements/desktop-cutover-05-09/` with SHA-256 receipts. They include initial
failures and reruns. The first assembled macOS host smoke rendered 30 rows and
message 999 from a 1,000-message transcript, exited successfully and left every
fixture byte unchanged. This is functional evidence, not a performance sample.
The real browser consent fixtures supplied deterministic choices at the native
dialog boundary; manual picker interaction and replacing existing downloads are
not established by those tests.

The independent review found and drove corrections for reply document identity,
denied-signal cleanup, compatibility work budgets, clipboard/endpoint FIFO hangs,
private activation receipts and close-request retries. Follow the final receipts
for the exact source qualified by each command; earlier receipt sets predate
later fixes.

Final primary-checkout checks before this checkpoint:

| Check | Result |
| --- | --- |
| Core/CLI (Node 24.22.2) | 127 passed, 3 opt-in/platform skips, 0 failed |
| Serialized desktop after fresh Vite build | 136 passed, 3 platform/opt-in skips, 0 failed |
| Session/Node-API/bridge compatibility matrix | 197 passed, 1 opt-in WK skip, 0 failed |
| Rust session core | 18 passed |
| Rust full host including native adapters | 21 passed |
| Windows x64 MSVC host type-check | Passed; not a runtime test |
| Release Wry lifecycle/recovery smoke | Passed independently against final release binary |
| Default-backend macOS production package | Unpacked app built; packaged chat/providers/PTY/native-traversal smoke and deep strict ad-hoc signature verification passed |
| Static parity inventory | 384 entries; regenerate/check passed |
| Original frozen artifacts | 324 original Git blobs matched exactly |

Formatting, Clippy with warnings denied, locked builds and the actual Node-API
consumer tests passed. Standalone Rust addon test startup prints missing Node-API
host-symbol diagnostics and has zero Rust tests; native execution is qualified
by the real Node tests instead. No Windows UI, paid inference or new matched
performance campaign was run.

The isolated history worktree's six fix files were byte-verified against the
integration checkout and its needed ignored logs were copied first. It has no
external dependency symlinks. The managed archive tool refused removal because
it classified that checkout as the task's primary checkout. Protection was left
intact and the checkout retained; no filesystem removal bypass was attempted.
All continuing integration commands explicitly target the original
`/Users/aryasalem/Downloads/Programming/suffice` branch checkout.

Requested agent routing was Astra High for browser, history and independent
review; Astra Medium for native services and process supervision. Effective model
routing is unverified. Work used depth one, at most four active agents and at most
two current-checkout source writers. The resource-budget fix used an isolated
managed worktree with its own dependencies. No shared dependency junctions were
created.

## Remaining migration requirements

Pi's live engine, provider/auth integration, Node extension runtime, current CLI,
web renderer and research utilities remain non-Rust. The eframe native viewer
still lacks complete interactive presentation and application parity. Existing
production features are retained through these original components, not claimed
as rewritten. The separate Pi pathname reopen race and 64-bit identity limitation
on ReFS remain documented qualification limits.

Windows source type-checking does not validate WebView2 behavior, OS services,
installed-machine lifecycle, accessibility or performance. Linux host support is
not qualified. Final release packaging, clean-machine signing/notarization,
screen-reader/keyboard/manual native dialogs, notification authorization and
matched repeated whole-app size/startup/process-tree measurements remain gates.
The historical Windows Wry comparison regressed and remains unchanged. No new
40% installer/idle-memory or 25% startup claim is made.

## Rebuild and rollback

Use Node 24.22.2, Bun 1.4.4 and Rust 1.92.0. Build the renderer and run
`node scripts/rust-migration/build-session-native.mjs`, then the locked host build.
Use fresh, distinct absolute home/profile directories and independently verified
session copies. The generated session addon lives only in the ignored
`apps/desktop-bridge/native` directory, separate from production traversal files.

Close the experimental host and unset `SUFFICE_SESSION_BACKEND` to use the
original Electron/Pi route. Browsing requires no schema rollback; Pi Send can
upgrade old journals, so retain an untouched verified copy before testing resume.
Preserve newly written data before any restoration. Frozen benchmark/report/
research bytes and all earlier migration measurements must stay unchanged.
