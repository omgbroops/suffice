# Matched real-UI host comparison: current Wry transition rejected

The goal remains a fully verified, substantially lighter/faster product. This
measurement rejects the **current** Wry/Node compatibility host as a production
replacement. Electron remains the product host; the Rust transition remains
isolated experimental code and evidence, not a second shipped path.

Five alternating pairs used release builds, fresh isolated homes/profiles,
identical 30-session/1,000-message fixture bytes, and matching 1440x900 CSS viewport
and DPR=1. Each host displayed the actual current web UI, selected the same saved
transcript, and asserted message999. No model inference occurred. No builds or
test campaigns ran concurrently. OS caches were not flushed. All ten runs
completed with no recorded errors or observed remaining PIDs.

| Metric | Optimized Electron | Rust/Wry + Node bridge |
| --- | ---: | ---: |
| Startup median, ms | 2,997.75 | 3,601.01 |
| Startup p10–p90, ms | 2,959.97–3,021.21 | 3,524.97–3,730.80 |
| Transcript selection median, ms | 1,587.27 | 1,517.03 |
| Idle aggregate working set, bytes | 660,377,600 | 712,187,904 |
| Post-transcript aggregate working set, bytes | 836,345,856 | 860,413,952 |
| Idle private committed bytes | 428,474,368 | 485,302,272 |
| Post-transcript private committed bytes | 600,690,688 | 624,914,432 |
| Observed idle process count | 6 | 12 |

Startup is 20.12% slower, idle aggregate working set 7.85% higher, and active
working set 2.88% higher. Private commit also worsens; the result cannot be
explained away as working-set sharing alone. Input/output transport and process
containment now have tests, but they do not establish a resource benefit.

The Rust executable is 1,150,464 bytes and its separate Node executable is
93,922,624 bytes, versus the Electron executable's 249,270,272 bytes. These are
**not installer totals**. Assets/dependencies and the existing shared WebView2
runtime must also be counted. The shared runtime's earlier measured logical
footprint was 920,838,213 bytes. Existing shared/reparented processes can be missed
by descendant snapshots; that limitation favors neither a full footprint claim
nor promotion of this incomplete prototype.

The raw `shutdownMs` values are **not directly comparable**: Electron measures
explicit app.close(), while Rust waits for its deliberate smoke-mode linger
timer. Do not present the roughly4.5-second Rust wait as actual shutdown latency.
A future benchmark must issue an explicit shutdown command after both active
snapshots. Startup/selection boundaries also have different automation transport
overheads, retained in raw method fields. They are not model/provider latency.

Raw results: `measurements/real-rust-vs-electron-01.json` and
`real-rust-vs-electron-summary-01.json`. All samples and diagnostics are retained.
The initial preflight did not launch either host because the dependency archive
incident was discovered first; it is recorded separately, not treated as a result.

The next substantial architecture opportunity is a genuine native Rust renderer
plus Rust application/session/runtime services. A separate isolated eframe native
UI lane is now implementing real saved-session browsing and rich transcript
interaction. It must preserve visual, keyboard, accessibility, math/diagram,
terminal and other behavior before promotion. The session core's serialization
ordering gap also needs closure before it supplies production replay. Neither
candidate is a completed rewrite.
