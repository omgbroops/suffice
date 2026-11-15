# Read-only session core (experimental)

This crate supplies Pi-style projection plus a bounded, capability-relative session reader used by the experimental native viewer. Electron/Pi still own production browsing and session resume. Nothing here migrates, rewrites, or creates session files. Tests use isolated synthetic histories, including v1/v2 data that Pi may rewrite if opened through its live session manager.

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

The native viewer retains its store between operations; the one-shot JSON executable opens an explicit root for each test request. It is not a persistent host, production adapter, or user-facing replacement CLI. Pure/legacy library `read_journal`, `project`, `summarize`, and `discover` helpers remain available for oracle work; ambient `summarize`/`discover` do not provide the store's bounds or confinement and must not be used for new file-reading integrations.

Opaque JSON object keys follow JavaScript integer-index enumeration in wire output: numeric index keys ascend before other insertion-order keys. This does not establish complete JSON.stringify byte parity. Explicit null leaf means empty path; omitted leaf means last entry. Cyclic parent chains error instead of reproducing Pi 1.5.2's possible hang.

## Checks and remaining compatibility

```text
cargo fmt --manifest-path crates/suffice-session/Cargo.toml -- --check
cargo clippy --locked --manifest-path crates/suffice-session/Cargo.toml --all-targets -- -D warnings
cargo test --locked --manifest-path crates/suffice-session/Cargo.toml
cargo build --locked --manifest-path crates/suffice-session/Cargo.toml
node --test crates/suffice-session/tests/differential.test.mjs
cargo build --release --locked --manifest-path crates/suffice-session/Cargo.toml
```

Tests import installed Pi 1.5.2 using Node 24. Set `SUFFICE_PI_ORACLE_ROOT` to another checkout with that pinned installation if needed. File bytes are checked before and after compatibility reads. Store regressions cover path escape, retained-root replacement, symlink replacement, non-regular files, sparse oversize, file growth, line and catalog budgets, parse recovery and provenance.

Timestamp conversion covers a tested subset of null, booleans, finite numbers, RFC3339/date-only strings, ordinary JSON objects, empty arrays and one-string arrays. Remaining gaps include JavaScript legacy date grammar and arbitrary array/object primitive coercion, number formatting and IEEE-754 boundaries, non-JSON undefined inputs, malformed primitive messages/entries, locale filename ordering (only ASCII ties compared), discovery error semantics, invalid Unicode, and platform path behavior. Desktop turn presentation, attachment handling, saved usage/model resolution, cache, authorization and lazy Pi resume remain separate production obligations. Bounds and confinement do not close those semantic gaps.
