# Acceptance gates established before product changes

Baseline: clean `a5116549cf847d4e4e2d764b9d6300e7b5038633`, Windows
11 build 26300, i7-12700H (14 cores/20 logical CPUs), 32 GiB RAM,
Node 24.22.2, Bun 1.4.4, Electron 45.3.0, Rust 1.92.0. Production Vite
build and Windows x64 unpacked app/NSIS installer. First desktop sample has
4,320 ms startup, 737,386,496 bytes idle aggregate working set, and 1,443 ms
to open the synthetic 1,000-message transcript. These are individual samples,
not final aggregate results; retain every run. Installer is 163,807,660 bytes.

The pinned pre-change traversal run (600 directories, 9,600 files, ten
samples) spans 56.34–75.70 ms, with median approximately 63.65 ms. The earlier
Node 24.22.1 run overlapped core tests and has substantial contention; retain
it as exploratory evidence and exclude it from acceptance comparisons.

## Repository traversal subsystem

Accept a Rust implementation only after exact differential parity on path
selection, ordering, hidden files, node_modules, symlinks, Unicode, errors,
new/deleted files, relative directories and real tool integration. Match the
original JS implementation on identical fixtures. Include process creation,
JSON decoding and ordering in timings. Alternate treatment order and use at
least 20 paired runs after warmups. Keep raw samples and failures.

- Large tree: median at least 25% faster (target <=47.74 ms at this baseline).
- Small tree: added median latency at most 5 ms; report both absolute and
  relative difference, including fresh invocation.
- Helper release artifact <=1 MiB; temporary helper process memory <=16 MiB.
- No persistent helper process, extra network, new authority, altered tool
  output or writes to user data. Bound output and process duration.

The threshold targets user-visible large-repository tool latency; a new process
can worsen small-repository behavior. If these gates fail, optimize once within
this stage, then retain the original production traversal and mark the candidate
rejected. A rejected prototype is historical evidence, not a second shipped path.

### Node-API interpretation

After the process candidate failed, the bounded optimization changed the boundary
to an in-process addon. Before running the paired addon memory experiment, the
implementation handoff retained a 16 MiB incremental memory allowance: compare
the **whole Node process** with and without the addon and require median paired
peak-working-set increase <=16 MiB. The addon has no helper process, so comparing
its entire Node host with a 16 MiB standalone-process ceiling would measure a
different boundary. Raw whole-process peaks, CPU time and the increase are all
retained. The latency, small-tree and artifact-size targets remain unchanged.

The initial process prototype and sequential addon failed their latency gates;
their raw results are not replaced. The final bounded worker implementation
passes the subsystem gates. Increased CPU and memory remain explicit tradeoffs,
and these results do not pass the desktop architecture gate.

## Desktop architecture

For a replacement of the whole app, require all desktop inventory rows resolved,
the same functional workloads, an installer at least 40% smaller, aggregate idle
working set at least 40% lower, and median usable startup at least 25% faster than
the matched baseline. No measured workload may regress by more than 10% without
an explicit justified product decision. CPU, memory peaks, accessibility,
keyboard input, Markdown/math/diagrams, PTY behavior, concurrency, recovery and
shutdown must also be verified. Do not infer these from screenshots.

These targets make a desktop architecture change worth its migration and support
cost. Small read-only prototypes can compare host overhead and expose platform
constraints; they cannot satisfy a whole-product acceptance gate or justify
deleting Electron/Pi. Compare native and webview prototypes on the same small
workload separately from the real full-app baseline.

## Data and evidence

Keep the original implementation and all historical evidence. The SHA-256
manifest covers 778 tracked baseline files. Product-file changes must be
reviewed explicitly; reports, research and original JavaScript benchmarks must
remain unchanged. No live provider calls are needed for these stages. Live
evaluation remains pending until a bounded spending decision exists.
