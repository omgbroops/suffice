# Paused migration checkpoint

Paused at the user's explicit request to commit and push current work. This is
unfinished work, not a release or completed Rust rewrite. Integration branch:
`arya/rust-migration`; primary source: `C:/Users/aryas/Programming/suffice`.

Observed validation before this checkpoint: original-app recovery suite has
122 core/CLI passes, 2 opt-in skips, and 99 desktop passes. The renderer matches
all 1,913 prior packaged output files byte-for-byte. Original benchmark/report/
research evidence has no missing files or changed historical bytes.

Five matched full-UI host pairs completed without errors. The transitional
Rust/Wry/Node host is currently worse than optimized Electron: startup +20.12%,
idle working set +7.85%, active working set +2.88%. It remains experimental.
The smaller host executable is not evidence of a lighter complete application.
Rust smoke shutdown wait includes a deliberate linger and must not be compared
directly to Electron app.close latency. See real-host-comparison-01.md.

Rust session-core ordering changes and additional differential tests are included.
The initial primary-checkout run used a stale debug executable and failed; do not
erase that log or call it a passing current-source run. Rebuild the crate before
revalidation. The isolated worker reported 18 passing tests; broader parity gaps
remain, including direct Rust integer-key serialization and JS date coercion.
The crate is not wired into production browsing.

The read-only native eframe candidate from the isolated worker is included under
apps/desktop-native. The worker built/tested its seeded session dependency, but
the combined primary snapshot has not been rebuilt with the latest session
ordering dependency changes. It has no send, math, Mermaid, terminal or complete
settings/native feature parity. Its ready event precedes actual window creation;
it is not comparable performance evidence. No production promotion is intended.

Read archive-incident-recovery.md before manipulating worktrees. A managed archive
followed a shared node_modules junction and removed workspace source. Recovery
used verified remaining-source/Git-bundle snapshots, original baseline hashes,
latest release staging and retained exact source patches/readbacks. Some recovered
test byte identities remain unverified; full revalidation passed. Do not create
shared dependency junctions or archive protected worker checkouts. Keep baseline,
artifact snapshots and ignored local installer/build artifacts recoverable.

Resume with: close session compatibility gaps and rebuild/test the combined
checkpoint; develop real native UI parity; measure whole-app outcomes; retain
trust, approvals, credentials, extensions, codemode, budget and storage behavior.
All remaining matrix rows and platform/performance qualifications remain in scope.
No live inference, release or deployment was authorized by this checkpoint push.
