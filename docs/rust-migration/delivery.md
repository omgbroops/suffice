# Rust migration delivery: verified partial checkpoint

**Assessment B: beneficial partial migration with retained components. The full
Rust objective is unfinished.** Repository traversal now has a measured Rust
implementation. Electron, the web UI, Pi and Node remain the production product.
There is no demonstrated reduction in total application footprint, and the full
desktop acceptance gate has not passed. One intermittent desktop test failure
remains unresolved. Do not treat this checkpoint as a completed rewrite or a
release-ready qualification.

## Branch and preservation

- Working branch: `arya/rust-migration`; baseline commit:
  `a5116549cf847d4e4e2d764b9d6300e7b5038633`.
- The initial working tree was clean. No unrelated dirty work existed. Changes
  remain local and uncommitted; nothing was staged, pushed, published or deployed.
- Recoverable baseline:
  `C:/Users/aryas/Programming/suffice-rust-baseline-a5116549/source.zip`, SHA-256
  `764f39ac9793a3853b1435aa2ede6c15b70f7345cc206118a0226a279cb04962`.
  Its extracted source, dependencies, release artifact and logs are retained.
- `measurements/baseline-manifest.json` records SHA-256 for all 778 original
  tracked paths. Original benchmark, report, research and `reports.zip` bytes
  remain unchanged. Intentional source/test/build changes are enumerated by the
  preservation comparison; no original file is missing.
- The final addon and matching Rust/adapter source snapshot are independently
  preserved under the baseline directory's `migration-artifacts/fc02d0b3/`.
  Addon SHA-256:
  `fc02d0b38177737ad751f3193fd8d98f14444fc7940b8982481c666d40dd2033`.

## Implemented code and rollback

`crates/suffice-fs` implements read-only traversal with iterative DFS, lexical
ordering, exclusions and bounded scoped workers. `crates/suffice-fs-addon` exposes
an asynchronous Node-API boundary. `packages/cli/src/native-files.mjs` loads it
lazily, preserves JavaScript locale ordering, limits native concurrency and
falls back to the original JavaScript traversal on missing/incompatible modules,
filesystem failures or invalid outputs. Both CLI and desktop repository tools
use this boundary; their parsers, schemas and model/agent behavior remain intact.

The build, staging, CLI file manifests and CI include the platform addon. Exact
locked dependency versions and upstream notices are retained. Installed-tool
checks exercise native discovery, `symbols`, `symbol_read` and
`symbol_references`; packaged Electron smoke loads the actual installed addon.
The addon does not receive credentials or open user sessions.

`verify-rollback.mjs` verified a recoverable addon backup, missing-addon fallback,
restoration and identical hash in fresh processes. No persistence format changed
and no user data was opened. Existing JavaScript code remains available. See
`architecture.md` for future session migration/backup obligations; Pi can rewrite
old sessions on open, so future tests must use independent copies.

## Measured subsystem benefit and cost

Windows 11 Home build 26300, i7-12700H, 14 cores/20 logical CPUs, approximately
32 GiB RAM. Node 24.22.2, Bun 1.4.4, Rust/Cargo 1.92.0, Electron 45.3.0,
Pi 1.5.2, Vite 8.3.8. All comparisons use release artifacts on this machine.
No model inference was used. Package/tool downloads used network access.

Values below are medians with [p10, p90]. The traversal fixture has 600
directories/9,600 files; the small fixture has four files. Twenty alternating
pairs follow two warmup pairs. Timing includes scheduling, traversal, native
conversion and JavaScript ordering. Every pair checks exact output equality.

| Metric | Original JavaScript | Final Rust boundary |
| --- | ---: | ---: |
| Large traversal, ms, n=20 | 38.67 [36.75, 45.55] | 17.46 [15.80, 20.55] |
| Small traversal, ms, n=20 | 0.12 [0.11, 0.24] | 0.11 [0.10, 0.18] |
| Whole Node CPU for 20 walks, ms, n=5 | 1,046.88 | 1,296.88 |
| Whole Node wall time for 20 walks, ms, n=5 | 973.69 | 530.80 |
| Whole Node peak working set, MiB, n=5 | 81.53 | 87.14 |

Large traversal is **54.85% faster** by paired-cohort medians. The addon is
310,272 bytes. Median paired peak-memory increase is **5.65 MiB**, within the
predeclared incremental 16 MiB allowance. CPU time increases **23.88%** in the
repeated-walk process workload. This is a latency benefit with transient CPU and
memory costs, not a resource reduction. The worker limit, output parity,
small-tree, artifact-size and incremental-memory gates pass on Windows.

Raw timings and variance: `measurements/walk-final.json`,
`addon-memory-final.json` and `summary-investigated.json`. The OS-reported peak
memory/CPU uses retained process handles and includes the whole Node child.
Independent peaks do not necessarily occur at the same instant; JIT, GC,
filesystem caching and host load contribute variability.

## Whole application outcomes

Both packaged builds use 30 synthetic saved sessions and a 1,000-message
transcript, with offline provider discovery and isolated homes/profiles. Startup
ends at a visible composer and complete thread list. Process-tree memory includes
main, renderer, utility and observed child processes. Working-set sums can count
shared pages more than once; private bytes and PID records are also retained.

The first matched block cohort, n=5 per build, gave the following results.
These results are retained even though the later interleaved investigation
changed the apparent startup ordering.

| Metric | Baseline median [p10, p90] | Current median [p10, p90] |
| --- | ---: | ---: |
| Ready, ms | 3,218.78 [3,112.79, 3,509.18] | 3,738.32 [3,679.85, 3,829.01] |
| Transcript opening, ms | 1,224.34 [1,125.80, 1,359.13] | 1,333.87 [1,317.25, 1,402.01] |
| Idle aggregate working set, MiB | 684.70 [682.69, 691.12] | 688.11 [686.60, 693.49] |
| Post-transcript working set, MiB | 859.48 [845.86, 860.28] | 871.30 [862.33, 882.06] |
| Terminal marker round trip, ms | 991.80 [940.32, 1,099.76] | 1,119.80 [1,087.04, 1,139.34] |
| Shutdown, ms | 151.64 [138.28, 165.20] | 157.30 [153.97, 181.66] |

The block startup median was 16.14% worse, so it triggered investigation. Five
additional alternating pairs used independent fresh profiles for every launch.
Their startup medians were **4,029.94 ms baseline / 3,789.75 ms current**;
terminal medians **1,174.70 / 1,161.10 ms** and transcript medians
**1,491.95 / 1,477.57 ms**. All ten investigative launches completed without
recorded errors. The block slowdown was not reproduced; cohort order and host
variation prevent attributing a whole-app startup improvement. This is not a
selected-best-run claim. Both cohorts, including all raw values, remain available.

Idle CPU tick-based measurements, fresh/warm distinctions, raw process records
and observed cleanup are retained in the desktop JSONs. No observed PID remained
after these measured shutdowns. Filesystem caches were not flushed; **OS-cold
startup was not established**. Working-set snapshots are not continuous peaks.

The original installer is 163,807,660 bytes and unpacked release tree is
526,084,728 bytes. The first Rust package was 163,915,699 / 526,397,404 bytes,
respectively. The final package, including upstream notices and integrity-bound
receipts, is **163,922,878 / 526,643,408 bytes**. Its native binary/receipt/notices
total 556,200 bytes. See `footprint-integrity-final.json`; prior package
measurements are also retained. Logical unpacked
sizes exclude installed registry/shortcut/uninstaller overhead and are not an
allocated-disk or clean-machine installation measurement. No total-footprint
reduction has been achieved.

## Desktop architecture prototypes

Five alternating runs per prototype use the same 30 labels/1,000-line selected
transcript. Selection, complete text, resize, scroll and shutdown are checked
programmatically; Wry also checks keyboard focus. These are limited controls,
not the full app and not screenshot-only parity evidence.

| Probe | Ready median, ms | Idle process-tree working set, MiB | Executable bytes |
| --- | ---: | ---: | ---: |
| Native Win32 controls in Rust | 71.15 | 16.33 | 226,304 |
| Rust Wry host with HTML/JS/WebView2 | 480.26 | 385.85 | 576,512 |

Raw ranges and variance are in `ui-probes-final.json`. Wry executable size excludes
the existing shared WebView2 runtime, whose measured logical footprint is
920,838,213 bytes. Shared/reparented browser processes can evade descendant
snapshots. Native Win32 is a promising Windows host direction; neither prototype
preserves the full Markdown/code/math/diagram/terminal experience, accessibility
or macOS support. **Neither replaces production Electron.**

## Functional and research verification

- Native adapter: **4/4 pass**, including exact ordered outputs, Unicode ties,
  changes, Windows junctions, symlinks where available, failure fallback,
  concurrency, `fs.stat` availability and event-loop heartbeat.
- Full core/CLI: **122 tests, 120 pass, 2 opt-in skips, 0 fail**. The initial
  baseline had 115 pass/1 fail/2 skips. The existing Windows Bash-oracle launcher
  used PATH's WSL launcher; choosing existing native Git Bash fixes that audit
  without changing glob subjects, expectations or grading boundaries.
- Full serialized desktop rerun: **96 tests, 95 pass, 1 fail**. The remaining
  `electron.test.mjs:198` timeout checks following a large streamed response.
  Earlier targeted runs passed. A bounded diagnostic with the same corrected
  harness against unchanged baseline UI and current UI passed once each.
  Those passes do not explain or negate the intermittent failure. Its cause
  remains unresolved; do not weaken the assertion or claim all desktop tests pass.
- Three stale UI test selectors/setup errors were independently reproduced on
  the original baseline, corrected, and passed as a 3/3 targeted group. Source
  labels, provider dialog behavior and the production UI were preserved.
- Rust formatting, Clippy with warnings denied, unit checks and locked release
  builds passed for the traversal/addon. Both UI probes built and passed their
  automated behavioral checks; the native fixture unit test passed.
- Packaged Electron smoke, source/staged repository tools, npm file manifest,
  baseline preservation (all 778 original paths), generator consistency and remove/restore rollback pass.
  See raw `.txt` logs and `rollback-final.json`.
- The subsequently added packaging-integrity test passes **1/1** separately from
  the recorded 122-test core run. It rejects missing notices/receipts, wrong
  architecture and stale binary/license hashes. Staging validates the complete
  group; the builder commits the hash-bound receipt last. Final source/staged/
  unpacked group hashes match, independently checked after the package rebuild.

Actual commands and local run instructions are in `local-run.md`. Research
validation uses the existing Node tests, frozen reference patches and original
JavaScript subjects. No subjects, hidden acceptance tests, reference repairs,
campaign inputs or historical results were translated or rewritten. Existing
budget/reservation, unknown-cost, resume, artifact and isolation tests remain.
No paid campaign or new live model comparison was run; historical scores are
not presented as matched new results. A new live evaluation requires a bounded
spending decision, which is not needed for the completed offline subsystem work.

## Rejections and evidence limits

The subprocess candidate failed: large median 46.58 -> 71.11 ms, and small median
0.36 -> 30.52 ms. The sequential addon improved large traversal only 18.32%, below
the 25% gate. Neither path ships. The bounded wide-root worker implementation
passes the unchanged latency thresholds. Failed results remain in trial 01 and
03 JSONs; trial 02 records a benchmark-adapter wiring error, not a performance
result.

Rejected binaries were rebuilt before archival. Their original hashes and raw
results remain, but source snapshots are explicitly labeled reconstructions;
their binary identity cannot be established. This is a reproducibility limitation
of the rejected new prototypes. The original product's historical evidence and
the final accepted binary/source snapshot are preserved. The initial failed Wry
navigation experiment also remains separate from successful measurements.

## Remaining work and qualification gaps

The source-backed matrix has **360 inventory rows** in `feature-parity.json` and
`feature-parity.md`, supplemented by engine/desktop/evidence inventories.
Literal extraction is not proof of exhaustive dynamic-extension discovery.
Only optional traversal has Rust verification; all other Rust migration rows
remain pending with their original implementations retained. It is not a
completed Rust parity matrix.

Unresolved: native desktop presentation/accessibility/keyboard parity; Rust
agent loop, Pi provider/auth/retry/compaction/session/usage contracts; full Node
extension compatibility versus isolated codemode; Rust CLI/persistence/tools/IPC;
research runner/report ports; cross-platform qualification; the intermittent
stream-follow test; whole-app resource/footprint gates. Browser/desktop automation
active overhead, sustained terminal throughput, attachment performance, streaming
frame latency, large-project UI search/navigation, concurrent-session peaks,
continuous whole-tree peak memory and clean-machine install/signing/notarization
are not established by these measurements. Existing tests cover selected
correctness aspects, not all performance requirements.

Windows runtime tests cover Node 24.22.2/Electron 45.3.0. macOS/Linux native runtime
tests and clean-machine `VCRUNTIME140` availability remain unverified. Missing or
incompatible addons use JavaScript. No OS, credential or service control was
bypassed; no user credentials were printed or copied into evidence. Isolation,
trust checks and approval behavior were retained.

Retained non-Rust components include Electron/Chromium, the web UI and rendering
libraries, Node/Pi AI/agent/TUI/MCP/codemode, QuickJS WASM, jiti, Acorn/TypeScript
stripping, node-pty/xterm, automation executables and historical/current research
utilities. They supply unresolved behavior, not dead duplicate production paths.
See `architecture.md` for the definition of full Rust and their boundaries.

## Agents and independent review

| Agent | Independent responsibility | Requested route |
| --- | --- | --- |
| inventory_desktop | Desktop inventory; process-tree, latency and memory harnesses | gpt-6.1-terra / medium |
| inventory_engine | Production/Pi contracts; Rust walker/addon and direct tests | gpt-6.1-terra / high |
| inventory_evidence | Research preservation; native UI probe; feature inventory | gpt-6.1-terra / medium |
| review_native | Ordering/security/concurrency, packaging and independent baseline diagnostics | gpt-6.1-sol / high |

Effective model/effort routing was **unverified**: runtime responses exposed task
identity/status but no effective-route metadata. Depth stayed one, at most four
agents ran concurrently including the coordinator, and writers had disjoint
ownership. Review found and prompted fixes for ordering, worker contention,
panic/error propagation and artifact hygiene. No remaining confirmed native-code
or packaging finding was reported; platform, measurement and UI gaps above remain.

Changed file groups: the two Rust crates; CLI adapter/workspace/tests/notices;
native build/license tooling; desktop staging/packaging/smoke and three test
corrections; Windows oracle lookup; CI; isolated architecture/rejection experiments;
project Codex guidance and migration docs/raw evidence. Historical data stayed
unchanged. All external actions were local tooling/dependency downloads, temporary
tests, verified snapshots and local artifact creation. There was no publication,
communication, destructive recovery or user-data migration.

Two hung Wry probe process trees were terminated after verifying their workspace
executable paths. Their failure evidence was retained; no existing Suffice user
profile or user app was used. The final audit records 13 intentional original
file modifications, no missing original files, no historical-evidence changes,
no newly unignored files >=1 MiB, no detected high-confidence credential patterns,
and passing source syntax/JSON/YAML/whitespace checks. Upstream notices were
retained in the final package; independent integrity review verified source,
stage and unpacked binary/receipt/notice hashes.
