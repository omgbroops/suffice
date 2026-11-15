# Active migration goal — continued 2026-11-15

The user's persistent goal remains active: a concretely verified, demonstrably
lighter app and continued work toward full Rust across all original features.
The earlier delivery report is a historical checkpoint, not completion.

Latest continuation: [`continuation-saved-view.md`](continuation-saved-view.md).
The native viewer now consumes Rust saved-transcript presentation and usage,
including private-summary/reasoning suppression and finite JSON number parity.
42 Node/Pi comparisons, 15 Rust tests and 9 native tests pass. Production
Electron browsing/resume and the full migration/performance gates remain open.

Previous integration: [`edge-to-edge-integration.md`](edge-to-edge-integration.md).
The user requested `experiment/edge-to-edge-chat`; upstream `9164605` was merged
with local migration checkpoint `801387e`, retaining the Rust addon, native hosts,
session store and earlier evidence. The current feature inventory includes the
new edge/shared-chrome, queue, access-mode, file-link/opener and resource behavior.
The full Rust rewrite and performance/platform gates remain open.

Previous continuation: [`continuation-session-store.md`](continuation-session-store.md).
Rust now supplies retained capability-relative, bounded discovery/reads to the
native viewer; 13 Rust session tests, 22 Pi/wire tests and 8 native tests pass.
The macOS desktop suite is now 97 passed, 0 failed, 2 Windows-only skips after
the wallpaper gate was resolved with controlled rendering evidence. Production
Pi reads and the full migration/performance/platform obligations remain open.

Previous macOS continuation: [`continuation-macos.md`](continuation-macos.md).
This supersedes the resume pointers below: session wire/missing-field
compatibility, combined native-viewer builds, platform tests and CI are being
qualified on macOS arm64. Original Windows measurements remain unchanged and
are not macOS performance evidence. The paused checkpoint remains historical.

Previous Windows continuation: see `continuation-process-session.md`. Core/CLI has
121 pass/2 opt-in skips and desktop has 99/99 pass in independent full runs.
The Rust host has suspended startup, a Windows Job and an independent bridge
exit monitor, bounded input/output queues and execution-based acknowledgment.
Eight native tests and real-UI release smoke pass. Read-only Rust session core
has 12/12 Pi differential tests, but is not yet production-integrated. No active
measurement/test process handle is intentionally left running at this handoff.
The immediate next priorities are matched real-host measurements, remaining
native integrations, and closing session-core parity gaps before wiring it in.

This continuation made concrete progress:

- `apps/desktop-rust` now hosts the **actual** Vite UI through Wry, with confined
  assets and IPC. Its release smoke opened 30 saved threads and the 1,000-message
  selected transcript. This is still experimental, with explicit native and
  isolation/lifecycle gaps; it has not replaced Electron.
- `apps/desktop-bridge` runs original desktop business logic and the real Pi
  worker under Node IPC. Its isolated session/PTY test passed. Node remains an
  explicit transitional runtime, not a full Rust claim.
- Main-process Pi imports are deferred: direct options import instead of harness
  re-exports, resource SDK loading on use, and model runtime SDK loading on use.
  Provider cancellation during deferred initialization has a regression test.
  Fourteen provider/resource/model-runtime tests pass.
- Five alternating module-import pairs show approximately 127 MB versus 53 MB
  Node RSS and 1.59 seconds versus 11 ms import time. These are module measurements,
  **not whole-app savings**. Raw data: `module-load-lazy-01.json`.
- A controlled real-renderer scroll regression failed twice against the old
  helper. Layout clamping is now distinguished from intentional upward scrolling.
  Three verification batches passed 6/6, including original Electron integration.
  The exact trigger of the earlier intermittent case is not proved to be composer
  shrink; evidence records that uncertainty.
- A native Rust operations module has been integrated into the Rust host source.
  Native parsing tests (3/3) and release compilation now pass after the quiet
  measurement. It adds real window/file-dialog/message-box/shell operations and
  rejects gaps; native dialogs still require behavioral/platform qualification.

Completed measurement: `measure-desktop-pairs.mjs` collected five alternating
release pairs against the preserved baseline, output
`measurements/desktop-lazy-interleaved-01.json` and its `.runs/` directory. Tool
session **47400 completed successfully**; do not restart it. Five pairs give
median startup 4,548 -> 3,112 ms, aggregate idle working set 741,318,656 ->
677,814,272 bytes (8.57% lower), and post-transcript working set 922,714,112 ->
873,349,120 bytes (5.35% lower). Terminal marker time was 1,486 -> 1,554 ms;
all failures/samples are retained, no errors recorded. These do not satisfy the
larger footprint targets or establish all-workload improvement. Summary is
`measurements/lazy-release-summary-01.json`. The measured Electron package predates
the final cancellation guard (same dependency graph); rebuild before final parity
qualification. This is a measured normal-workload whole-app memory benefit,
not a completed Rust migration or reduced installer-size claim.

Next concrete work after that measurement:

1. Strict real-UI smoke after native integration passes: 30 rows and marker999,
   exit0, `rust-host-native-smoke-03.txt`. An initial Windows entry-point failure
   (-1073741511) from enabling rfd custom buttons was fixed by embedding the
   Common Controls v6 asInvoker manifest. Keep the failed run02 evidence too.
   Native host release build and three parsing tests pass. Independently review
   boundary/lifecycle. The bridge now has a tested optional
   --wait-for-host boot gate (4 bridge tests pass). Implement a Windows job before
   sending host-start so descendant process creation cannot race containment;
   do not claim forced cleanup is proved yet.
2. Measure complete Rust-host/Node/WebView2 process tree on matched real workload,
   including existing shared WebView2 disk contribution and Node sidecar.
3. Implement missing clipboard/image/trash/startup/notifications/multi-window,
   bounded IPC/backpressure and forced process-tree cleanup. Unsupported features
   currently prevent production promotion.
4. Rebuild final Electron package and run full desktop/core suites after the
   correctness/lazy-loading changes; retain every failure and raw measurement.
5. Move application state/session read paths into Rust with original Pi fixture
   differential tests, then progressively replace the agent runtime. Preserve
   Node extension/codemode compatibility, authorization and data rollback.

Agents this continuation: rust_host Terra High, node_bridge Terra High,
scroll_follow Sol High, native_operations Terra Medium. Effective routing remains
unverified. Depth one; disjoint source ownership; no publication or live inference.
All historical baseline evidence remains protected. Do not mark the broad goal
complete while application parity/performance/platform requirements remain open.
