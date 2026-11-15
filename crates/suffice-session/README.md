# Read-only session core (experimental)

This crate supplies Pi-style projection, desktop saved-transcript presentation/usage, and a bounded capability-relative session reader used by the experimental native viewer. Electron/Pi still own production browsing and session resume. Nothing here migrates, rewrites, or creates session files. Tests use isolated synthetic histories, including v1/v2 data that Pi may rewrite if opened through its live session manager.

## Retained session store

`SessionStore::open(absolute_root, ReadLimits::default())` opens one explicit directory capability. `discover()` returns `Discovery { sessions, skipped }`; each `SessionInfo` has a `relative_path` and Pi-style JSON `summary`. `read(relative_path)` returns strict journal entries. Names must resolve as two normal components, `group/file.jsonl`. Each group and final file is opened without following symlinks, relative to directory handles; selecting a listed session never reopens an ambient canonical pathname. Renaming/replacing the original root pathname does not redirect its retained capability. The root's supplied spelling is used only for display paths.

The implementation uses pinned [cap-std directory capabilities](https://docs.rs/cap-std/4.0.3/cap_std/fs/struct.Dir.html) and cap-fs-ext no-follow/nonblocking options. Directory enumeration, summary metadata, and sorting do not reopen data by absolute paths. Final handles must be regular files. This is filesystem authority confinement, not a transactional snapshot, file identity attestation, protection from hard links/mounts authorized inside the selected root, or proof against every platform/filesystem behavior. macOS tests pass; Windows/Linux runtime qualification remains pending.

Default hard budgets (callers may lower them, but cannot raise/disable them):

| Budget | Limit |
| --- | --- |
| File input | 64 MiB |
| Aggregate discovery input | 256 MiB |
| Physical line, including newline | 8 MiB |
| Physical lines per file, including blanks/invalid records | 250,000 |
| Directory entries inspected per discovery | 50,000 |
| Candidate `.jsonl` files per discovery | 10,000 |

Metadata rejects oversized files before parsing. Reads also enforce budgets while streaming, including growth after metadata inspection; one sentinel byte can be consumed to detect excess. Discovery folds each record into its summary and discards opaque decoded messages, rather than retaining every candidate journal. Invalid candidate files and per-file limits are reported in `skipped`; a global scan budget fails the operation rather than returning an apparently complete partial catalog. Discovery tolerates invalid JSON records as Pi listing does. Strict reads reject invalid UTF-8 and middle/newline-terminated JSON corruption; an invalid unterminated final record is ignored for crash-tail recovery.

These are input/work budgets, **not heap/RSS or wall-time guarantees**. Summary search text is retained; strict reads and projections allocate decoded values, and projection/JSON response construction can multiply the input footprint. Nonblocking opens avoid waiting on an ordinary FIFO, but regular-file/network-filesystem I/O can still block. Concurrent append/mutation may be observed; fallback/sort metadata comes from the opened handle after scanning, without promising an atomic snapshot. Cancellation, paging, large-history memory measurements and broader malformed/Unicode/platform qualification remain required before production promotion.

## JSON test interface

Build the executable before testing it; do not reuse a stale target. It reads one request from stdin and writes one response (`ok` plus `result` or `error`). Request and response wire budgets are 128 MiB, including the response newline; output buffering is capped, but response construction is not a heap cap.

- `journal`: `source` string -> strict entries (legacy in-memory parser).
- `project`: `entries`, optional `leaf` -> projection.
- `discover`: absolute `root` -> summary array, now through the bounded store; retained for existing differential fixtures. Use `discover_confined` to receive skipped reasons too.
- `discover_confined`: absolute `root` -> `{ sessions: [{ relativePath, summary }], skipped }`.
- `read_session`: absolute `root`, `relativePath`, optional `leaf` -> `{ entries, projection }`. Session headers are excluded from the Pi graph, while projected `sourceIndex` values still point into the returned raw journal entries.
- `present`: `entries`, optional `leaf` and numeric `contextWindow` -> `{ messages, usage }`, using the desktop's outward saved-message shape.
- `present_session`: absolute `root`, `relativePath`, optional `leaf` and numeric `contextWindow` -> the same saved view, read through `SessionStore`. This response omits raw entries and private compaction summaries.

The native viewer retains its store between operations; the one-shot JSON executable opens an explicit root for each test request. It is not a persistent host, production adapter, or user-facing replacement CLI. Pure/legacy library `read_journal`, `project`, `summarize`, and `discover` helpers remain available for oracle work; ambient `summarize`/`discover` do not provide the store's bounds or confinement and must not be used for new file-reading integrations.

Opaque JSON object keys follow JavaScript integer-index enumeration in wire output: numeric index keys ascend before other insertion-order keys. Finite JSON inputs are rounded to ECMAScript binary64 Numbers, including integers beyond 2^53; parsing enables round-trip float conversion and serialization uses pinned ryu-js 1.0.3 for JavaScript decimal spelling, negative zero and exponent thresholds. `to_js_string(value, true)` supplies two-space tool-argument display with the same numeric/key conventions. A seeded corpus generated from 2,048 binary64 patterns (excluding non-finite values) and explicit boundaries compare raw wire strings, rather than parsing away formatting differences. This does not establish complete JavaScript value/Unicode/overflow parity. Explicit null leaf means empty path; omitted leaf means last entry. Cyclic parent chains error instead of reproducing Pi 1.5.2's possible hang.

## Saved presentation boundary

`desktop_messages(entries, leaf)` applies the Pi graph then desktop presentation: chronological compaction/interruption markers, suppression of private compaction summaries, turn ancestry/latest-end/backfill semantics, prompt-hash display metadata, bounded legacy attachment markers and renderer-normalized text/tool/image fields. `saved_usage(entries, context_window)` follows the existing Node/Pi cumulative and current-window calculations, including its partial-usage field conventions. Missing usage remains null; the Rust port does not invent prices or independently resolve models. The host supplies an optional resolved model context window.

The native viewer consumes these normalized values, shows display prompts and attachment metadata, and suppresses persisted reasoning at render time like `threads-ui.js`. The backend message payload retains normalized thinking blocks to match Electron's existing API; it is not an API that redacts every reasoning field from memory or transport. Select failures preserve the previous messages/usage/selection. Native images, live turns, settings and complete visual/accessibility parity are not implemented by this boundary.

## Checks and remaining compatibility

```text
cargo fmt --manifest-path crates/suffice-session/Cargo.toml -- --check
cargo clippy --locked --manifest-path crates/suffice-session/Cargo.toml --all-targets -- -D warnings
cargo test --locked --manifest-path crates/suffice-session/Cargo.toml
cargo build --locked --manifest-path crates/suffice-session/Cargo.toml
node --test crates/suffice-session/tests/*.test.mjs
cargo build --release --locked --manifest-path crates/suffice-session/Cargo.toml
```

Tests import installed Pi 1.5.2 and the current Electron presentation/usage functions using Node 24. Install the frozen dependencies in this checkout for the complete suite. The original projection differential file additionally supports `SUFFICE_PI_ORACLE_ROOT` for an external pinned Pi installation. File bytes are checked before and after compatibility reads. Store regressions cover path escape, retained-root replacement, symlink replacement, non-regular files, sparse oversize, file growth, line and catalog budgets, parse recovery and provenance. Presentation tests compare complete normalized responses to the actual Node functions, including off-branch markers, turn identities, undefined/null distinctions, attachments and floating-point aggregation order.

Timestamp conversion covers a tested subset of null, booleans, finite numbers, RFC3339/date-only strings, ordinary JSON objects, empty arrays and one-string arrays. Remaining gaps include JavaScript legacy date grammar and arbitrary array/object primitive coercion, overflowed numeric literals that JSON.parse accepts as Infinity, non-JSON undefined/reference aliases, malformed primitive messages/entries, locale filename ordering (only ASCII ties compared), discovery error semantics, invalid Unicode/unpaired surrogates, and platform path behavior. The read-only native candidate now uses the Rust saved-view port, but production cache/catalog authorization, model resolution and lazy Pi resume remain Node-owned. Broader adversarial/legacy/platform qualification and memory/performance evidence are still required before making it authoritative for production browsing.
