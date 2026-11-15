# macOS continuation — 2026-11-15

Resumed `arya/rust-migration` from `5abd622` on macOS 26.5.2 arm64. The
Windows checkpoint and its raw evidence remain historical records. This is
continued implementation and qualification, not completion of the migration.
Electron/Pi still own production browsing, messaging, tools and settings.

Evidence: [`measurements/macos-continuation-01/summary.json`](measurements/macos-continuation-01/summary.json),
with raw logs, runtime/addon metadata, preservation results and SHA-256 receipts
in the same directory. Prior Windows samples were not overwritten.

## Changes

- The Rust session wire orders integer-index keys numerically before other
  insertion-order keys, including nested opaque tool arguments. Differential
  tests compare the raw Rust wire, so JavaScript parsing cannot hide an ordering
  error. Additional tests cover bounded date coercions and missing projection
  fields. This does not implement the entire JavaScript date/number/Unicode
  contract; the session crate remains experimental and read only.
- The native eframe viewer lockfile is repaired against the combined session
  dependency. Its smoke selects the executable for the current platform. Session
  discovery and the first completed UI update have separate events; neither is
  proof of OS presentation or a usable-startup performance measurement.
  Saved session titles can be filtered, with keyboard navigation of matches.
- The transitional bridge canonicalizes its checkout root before matching the
  confined Electron shim. macOS `/var` and `/private/var` spellings previously
  caused the gate fixture to load the real Electron module instead of the shim.
- Traversal fixtures accommodate filesystems that alias NFC/NFD path spellings.
  Desktop tests wait for clipboard completion and assert native macOS caption
  behavior separately from Windows caption geometry. The wallpaper test uses a
  fresh profile and scopes effect choices to their menu. The offline OAuth
  authorization test uses macOS's supported `127.0.0.1` loopback address.
- CI now rebuilds the session executable before Pi differential tests and checks
  the experimental native viewer and bridge. These workflow changes have been
  exercised locally on macOS; hosted CI and Windows reruns remain outstanding.

## Environment and preservation

Installed Rust 1.92.0 and Bun 1.4.4; used Node 24.22.2. The preinstalled Bun
1.3.14 could not read the frozen version-2 Bun lockfile; that failed installation
did not modify the lock. Frozen dependencies and desktop runtime setup succeeded
with the pinned tools. Bun briefly changed the CLI entry point's executable bit;
it was restored to its tracked mode without changing content.

The original preservation manifest was made from Windows checkout bytes. On this
Mac, 127 of the 324 historical report/research/benchmark files match it directly;
197 match after LF-to-CRLF conversion. All 324 match the original `a5116549` Git
blob bytes in the Mac checkout. No historical evidence was rewritten to make the
old manifest pass. The failed raw cross-platform manifest check is retained too.

## Qualification boundaries

Observed local checks (pinned tools; logs retained with this continuation):

| Check | Result |
| --- | --- |
| `bun run desktop:build` | Passed |
| Native traversal release build and installed navigation tools | Passed on macOS arm64 |
| Core/CLI: `node --test tests/*.test.mjs packages/cli/test/*.test.mjs` | 121 passed, 3 skips, 0 failures |
| Session debug/release build, fmt, Clippy and Pi differential suite | Passed; 20 differential tests |
| Native viewer locked release build, fmt, Clippy and tests | Passed; 6 tests including actual egui update/input |
| Native viewer release smoke | 1,000 projected messages, marker found, layout completed, fixture hash unchanged |
| Bridge: `node --test apps/desktop-bridge/*.test.mjs` | 4 passed |
| Wry host locked debug/test/release builds, fmt and Clippy | Passed; 6 applicable macOS tests |

The original desktop Mac run had 92 passes, five failures and two Windows-only
skips. Three failures were traced to test assumptions (Windows controls and an
asynchronous clipboard read); all five cases in those three test files passed
after correction. The five provider tests also pass after correcting the
callback-host assumption (`127.0.0.2:1455` is unavailable on this Mac). The
remaining observed failure concerns the wallpaper pixel checksum after reload.
A fresh-profile diagnostic with identical canvas dimensions, theme and persisted
frame still differed; its cause is unresolved. Do not call the original 99-case
run passing or assume renderer persistence has been completely qualified.

The final serialized desktop rerun has **96 passed, 1 failed, 2 Windows-only
skips** (99 total). Its single failure is the wallpaper reload checksum wait.
The original failed run, isolated failures, diagnostic state and final run are
retained; the assertion was not relaxed to make it pass.

Independent review caught an early native search integration bug: arrows were
opening files rather than only highlighting matches. Separate highlight/open
actions and an egui `App::update` input regression now verify arrows leave the
selected transcript intact and Enter opens the fixture. The initial failing
integration test exposed widget focus handling before the corrected run passed.
Empty-result navigation
and failed-load state are covered separately from OS input/accessibility.

The Wry host compiles and its six applicable tests pass on macOS. Its two Windows
containment tests cannot run here, and the host still deliberately rejects
non-Windows operation before launching an uncontained bridge. A compiled macOS
binary is not a qualified macOS product host.

No comparable whole-app performance campaign ran during this continuation.
Builds and tests overlapped; their elapsed times are not performance evidence.
Native viewer layout/search checks do not establish visual parity, accessibility,
screen-reader support, send/streaming, math, Mermaid, images, PTY, approvals,
authentication, extension or settings parity. Session discovery still requires
the documented confinement/resource-limit work before production integration.

## Next work

Close remaining session date/numeric/malformed-input/discovery differences and
resource/confinement gaps against Pi fixtures before replacing production reads.
Continue native presentation and interaction parity with actual input evidence.
Resolve the remaining Mac desktop qualification failures, then run Windows and
Linux checks. Preserve the existing Electron path, rollback and historical
evidence while measuring complete, matched workloads only after parity improves.

Discovery/implementation used two Terra Medium lanes (session and native viewer),
one Terra High regression diagnosis lane, and a Sol High independent review lane.
The coordinator owned bridge, CI, platform-test corrections and this handoff.
Effective child model routing
was not exposed by runtime metadata and remains unverified. All lanes stayed at
depth one with disjoint file ownership.
