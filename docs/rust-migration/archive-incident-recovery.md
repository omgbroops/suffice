# Managed worktree archive incident and verified recovery

During isolated-agent work, the coordinator created a shared `node_modules`
junction pointing from a worker checkout to the integration checkout. Archiving
that worker through the managed worktree tool followed the dependency graph,
including Bun's workspace links, and removed dependency files plus the primary
desktop/CLI workspace folders. This was an avoidable cleanup mistake. No further
archive operation will be attempted on a checkout with shared reparse points.

The integration checkout remains `C:/Users/aryas/Programming/suffice` on
`arya/rust-migration`. A retained protected worker checkout is not the integration
location; use explicit working directories. The tool refused to archive that
protected checkout, and that protection was not bypassed. Its remaining junction
was verified as a junction to the exact expected target and removed only as a
link via nonrecursive directory deletion before dependency restoration.

Before repair, remaining source was copied and hashed into
`C:/Users/aryas/Programming/suffice-rust-baseline-a5116549/recovery-archive-incident-01`.
The snapshot contains 665 surviving source/evidence files, a missing-path list,
status and a complete `git bundle --all`; `git bundle verify` passes. Git metadata
was healthy, so no reset/history repair occurred.

All 304 missing baseline paths were restored from individually SHA-256-verified
baseline files. Latest changed production desktop/CLI source was restored from
the successful release staging directory recorded by `release/build-result.json`.
Scroll source/tests were recovered from retained exact patches/readbacks; three
known UI test corrections and the provider cancellation case were reapplied.
The native walker tests were recovered from prior patch content with a separately
reconstructed Windows junction case. Prior byte identity of these recovered test
files is not established; this uncertainty is retained rather than hidden.

`bun install --frozen-lockfile` restored 562 packages with Node24.22.2/Bun1.4.4.
The renderer rebuilt successfully, and all **1,913** output files match the
pre-incident packaged renderer byte-for-byte. Production native tool verification
passes. Fourteen targeted recovery checks pass. Independent full recovery runs:

- Core/CLI: 124 total, 122 passed, 2 opt-in skips, zero failed.
- Serialized desktop: 99 passed, zero failed or skipped.

The additional core case is the explicitly reconstructed junction test, not a
changed application feature. Preservation verification reports zero missing
baseline paths and zero changes under the original benchmarks/reports/research
or reports.zip. Historical visual assets were restored byte-for-byte too.

Evidence: `measurements/archive-incident-01.json`,
`archive-incident-restoration-01.json`, `recovery-preservation-01.json`,
`recovery-renderer-comparison-01.json`, `recovery-targeted-tests-01.txt`,
`recovery-core-20261115-141238-0769.txt`, and
`recovery-desktop-20261115-141238-1045.txt`.

Future agent checkouts must install their own dependencies or refer to an explicit
read-only oracle path, not share workspace junctions. Before any managed archive,
inspect and safely remove shared reparse points first, verify integrated output
hashes, and preserve ignored artifacts that matter. The remaining worker is left
intact. No user profile, credentials, remote repository or published deployment
was modified by recovery. The broader Rust goal is still active; this recovery
does not constitute migration completion.
