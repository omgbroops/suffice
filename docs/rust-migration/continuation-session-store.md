# Retained Rust session store — 2026-11-15

Continued the active Rust migration after the first macOS qualification. This
implements an IO boundary needed for Rust-owned saved history; it does not
promote the viewer or replace the production Pi session manager.

Evidence: [`measurements/session-store-02/summary.json`](measurements/session-store-02/summary.json),
with raw logs, review/source/dependency receipts and SHA-256 hashes alongside it.

## Concrete changes

`crates/suffice-session` now owns a retained directory capability. Discovery and
selection open `group/file.jsonl` relative to handles, reject symlink components,
check opened handles for regular files, and apply input budgets while streaming.
The native eframe viewer uses the same retained `SessionStore` for listing and
selection. It no longer reads all candidate files before a size check or reopens
selected histories by ambient paths. Skipped candidates are visible in the UI.

Limits are 64 MiB per file, 256 MiB aggregate discovery input, 8 MiB physical
lines, 250,000 lines per file, 50,000 inspected directory entries and 10,000
candidate histories. Callers can lower, but cannot disable or raise, the hard
caps. Metadata rejects sparse oversized files before decoding; streaming checks
also catch growth after metadata inspection. One sentinel byte may detect excess.
Buffered read-ahead is charged even if a candidate later fails a parse/line limit.
Per-file failures are reported; global scan limits fail the complete operation.
Discovery folds opaque records into summaries instead of keeping all journals.

The JSON test interface adds `discover_confined` and `read_session`. Raw journal
headers are excluded from the Pi projection graph, but `sourceIndex` maps back
to the original returned journal. Both wire directions are capped at 128 MiB;
the response newline is included. The legacy array-shaped `discover` test
operation also uses the bounded store. Existing pure/ambient oracle helpers
remain explicitly unsuitable for new file-reading integrations.

Pinned dependencies: cap-std 4.0.3 and cap-fs-ext 4.0.3, with separate updated
session/native Cargo locks. The [directory-capability API](https://docs.rs/cap-std/4.0.3/cap_std/fs/struct.Dir.html)
was inspected along with installed crate source for no-follow/nonblocking behavior.
Only the explicit root open uses ambient authority. Source-hash and dependency
receipts are retained in the continuation evidence.

## Wallpaper gate resolved

The earlier failure was an exact pixel checksum across different canvas rendering
paths. Saved PNG bytes, crop, effect, dimensions and decoded input matched.
Disabling accelerated 2D made the original exact check pass. A controlled
same-page comparison of default and `willReadFrequently` canvases reproduced
1,392,367 differing channels, maximum difference two; after repeated readbacks
the canvases agreed exactly. The control's diagnostic test deliberately retained
the original failing checksum assertion, and that failed log is kept too.

The test now verifies persisted PNG bytes and settings exactly, and compares
every rendered pixel within the measured two-channel-value bound for this
fixture. Math, sanitization, code-copy, Spotlight, crop/cancel and effect checks
remain. No production rendering code or launch flag changed. This establishes
the fixture's persistence behavior; it is not a universal pixel tolerance for
all artwork/platforms.

## Observed validation

Node 24.22.2, Bun 1.4.4, Rust 1.92.0, macOS 26.5.2 arm64. Tests/builds overlap;
their durations are not comparable app-performance measurements.

| Check | Observed result |
| --- | --- |
| Session Rust tests | 13 passed (growth, read-ahead accounting, output buffer, 10 store tests) |
| Pi/wire differential tests | 22 passed, including provenance and crash-tail reads |
| Native viewer tests | 8 passed, including symlink replacement, sparse oversize and actual egui input |
| Session/native formatting and Clippy, warnings denied | Passed |
| Session/native locked release builds | Passed |
| Native release smoke | 1,000 messages, final marker, completed layout, unchanged fixture |
| Full serialized Electron desktop suite | **97 passed, 0 failed, 2 Windows-only skips** |
| Renderer rebuild | Passed after diagnostic instrumentation was removed |

Commands are in the session/native READMEs and `AGENTS.md`. CI now runs session
Rust tests as well as rebuilding before the Pi differential suite. Hosted CI,
Windows and Linux execution remain outstanding.

Independent review found and closed raw-journal provenance, response-newline
budget and post-scan metadata issues. Sort/fallback metadata is captured from the
retained file handle after reading; sorting never restats ambient file paths.
Windows fixtures release handles before deletion and allow the capability itself
to prevent root renames. That is source preparation, not an observed Windows pass.

## Remaining migration obligations

These are input/work caps, not heap/RSS or wall-time guarantees. Decoded journals,
projected messages, search text and response construction can multiply memory.
Regular-file/network-filesystem IO can block. Reads are not transactional
snapshots, and authorized hard links/mounts do not prove original inode identity.
No user session, profile or credentials were opened for these tests.

Session legacy date/number/coercion/malformed-input/locale/Unicode compatibility
still needs closure. Production integration must preserve desktop turn/attachment
presentation, private compaction handling, cumulative/current usage, cached reads,
catalog authorization, and lazy Pi resume only on Send. The next adapter should
return raw Rust data into those existing Node presentation functions until those
responsibilities themselves move to Rust. The compatibility gaps prohibit making
the prototype authoritative for production browsing today.

Continue native feature parity, Rust agent/runtime/tool/state ownership and
extension/codemode compatibility. Production still retains Node/Pi/Electron and
the complete web renderer. The Wry host still requires Windows containment.
Whole-app size/startup/memory targets and platform/accessibility/recovery gates
remain open; no performance win, completed rewrite, release or deployment is
claimed. Earlier Windows/macOS evidence and frozen historical inputs remain intact.

Agents: Terra Medium production-contract discovery, Terra Medium native store
integration, Terra High wallpaper diagnosis, and Sol High independent review.
Effective routing was not exposed by authoritative runtime metadata and remains
unverified. Root owned the Rust IO/projection/wire implementation, tests, CI and
this handoff. All lanes stayed at depth one with disjoint write ownership.
