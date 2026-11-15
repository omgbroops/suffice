# Process containment and Rust state continuation

The full migration goal remains active. The previous goal turn made concrete
progress; this turn implemented and tested additional runtime/state code. Neither
the experimental Rust host nor the session library has full product parity.

## Verified changes

The Rust host creates its Node bridge suspended, assigns it to an unnamed
kill-on-close Windows Job, then resumes its initial thread and sends host-start.
This covers Node preloads without deleting the user's NODE_OPTIONS settings.
The bridge's independently tested boot gate prevents application code loading
before the explicit start message. The host rejects unsupported platforms before
launching a process rather than falling back to uncontained operation.

Pipe writes run on a separate writer thread through a bounded queue (32 frames,
64 MiB). Shutdown starts its deadline before attempting the nonblocking shutdown
enqueue. Job teardown terminates remaining bridge descendants, including when
the direct bridge has already exited. An independent retained-handle process
monitor terminates descendants on bridge exit even if the UI/renderer or pipe
reader cannot make progress.

Renderer-to-host frames reserve count/byte capacity before being copied into
Tao's queue. Engine output is framed with a 64 MiB limit and acknowledged after
WebView2's JavaScript execution callback, preventing an unlimited script queue.
Node stdout has an explicit pending-byte limit. These are experimental protocol
limits, not a claim that arbitrarily large valid transcripts/configurations are
supported. Chunking and graceful overload recovery remain required work. The Job
currently contains the bridge/engine subtree; forced WebView2 cleanup still needs
separate qualification.

Native tests: 8/8 pass, including real suspended Node spawning a grandchild,
retained-handle termination assertions, independent bridge-exit cleanup without
UI progress, blocked-pipe enqueue behavior, frame completeness/UTF-8/size and
capacity release. Windows job teardown can legitimately report exit code zero;
the initial incorrect nonzero-exit assertion was corrected to rely on kernel
process-handle signals. Both original and corrected logs are retained.

Clippy with warnings denied passes. The release host's real-UI smoke passes with
30 saved threads and the selected 1,000-message transcript (marker999), including
bounded transport and containment. Source formatting and the final platform
guard do not constitute additional runtime coverage. Native dialogs, clipboard,
image conversion, trash, notifications, startup integration, multi-window,
accessibility and broader failure recovery still require completion/verification.

`crates/suffice-session` is a real read-only Rust discovery/journal/projection
library with a JSON differential-test executable. Twelve tests against installed
Pi 1.5.2 pass using pinned Node24.22.2. It covers branches, leaf selection,
compaction, context edits, provenance indexes, strict/truncated journals and
legacy fixture byte preservation. Its README explicitly records remaining date,
malformed-input, ordering, Unicode, memory and integration gaps. It is not wired
into production browsing and is not a replacement CLI.

Independent original-app checks: 123 core/CLI tests (121 pass, 2 opt-in skips),
99 serialized desktop tests (99 pass), both exit0. Their durations overlap other
build/test activity and are not performance measurements. This closes the earlier
recorded desktop-suite failure for this observed run; it does not imply exhaustive
correctness. No live inference or user credential access occurred.

## Evidence and routing

Measurements are under docs/rust-migration/measurements/:

- continuation-core-20261115-133347-4045.txt
- continuation-desktop-20261115-133426-9383.txt
- contained-host-smoke-02.txt
- session-rust-differential-01.txt
- continuation-host-tests.txt and continuation-host-clippy.txt
- continuation-bridge-tests.txt

Agents: containment_review (requested Sol High, read-only security/lifecycle),
regression_checks (Terra Medium, independent validation), rust_session_contract
(Terra Medium, source contract then isolated new Rust crate). Effective routing
is unverified. Root owned host integration/containment/transport; other source
writers owned separate new files. No commit, push, publication or deployment.

## Next required work

Measure the real Rust-host/Node/WebView2 tree against identical Electron workloads
before accepting it. Complete native integration gaps and test forced whole-host
cleanup, including browser descendants. Integrate Rust session reading only after
its documented semantic gaps have differential coverage; remove the mandatory Pi
history-browsing import path without losing presentation/usage behavior. Continue
Rust state, tools, CLI and agent/runtime implementation while preserving existing
extensions/codemode and original session data. Do not mark the goal complete on
these narrower test results.
