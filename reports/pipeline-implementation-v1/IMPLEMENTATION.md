# Opt-in pipeline implementation

Implemented in the separate `suffice-v2` checkout, branch `codex/suffice-v7-experiments`, based on CLI alpha commit `124e0e194d526064a6b66b951faf4c4d64853f5a`. The pre-existing v2 copy's 25 source/test/benchmark/review files are byte-identical to the before-build receipt. The main Suffice checkout remains clean. No push or merge was performed.

## Delivered

- A standalone `npm run pipeline` entrypoint using Pi sessions, codemode and existing AST tools. Normal `npx suffice` behavior is unchanged.
- Independently selectable thin prompt, prepared public source context, explicit contracts/project guidance, advisory notices, output control, repair/advice/takeover, effort scheduling and verified runbook reuse.
- Deterministic public verification after implementation and repair, with a shared total dollar/time/response/tool allowance.
- Tool-free one-response Sol Low advice, Luna High implementation by default, bounded repairs and optional Sol Low takeover. Every stage's source context refreshes; all prompts, full responses and costs remain archived.
- Exact native command-byte capture before Pi truncation; bounded model-facing output and stream previews; opaque-handle retrieval. Codemode programs continue to receive original structured results.
- Independent-task fleets: one batched tool-free Sol advice request, at most two simultaneous workers in non-overlapping repositories, disjoint budget reservations and complete shared advice accounting.
- Source-backed runbooks requiring successful source and distinct fresh-replay verification receipts; explicit task-boundary handoff artifacts preserve complete supplied history. These are caller-controlled APIs, not automatic learning or session reset.
- Receipts reject reused run directories. Missing provider-response usage remains unknown; overshoot, errors and failed verification remain visible.

## Validation

`npm test`: **56 passed, 0 failed**. Includes real offline Pi codemode execution, tool-free adviser session construction, repository instructions isolation, exact recovery beyond 1 MiB, concurrent output/cancellation/binary cases, refreshed compatibility contracts, actual nonzero check exit codes, shared budget and missing receipt paths, fleet isolation/reservations, runbook validation and retained-context notices. No paid inference was used for these tests.

An independent read-only implementation review found and helped resolve context loss across fresh repair stages, malformed request handling, exact-limit completion, imported runbook validation and receipt reuse/unknown-cost accounting. Final review found no remaining concrete blocker within its reviewed scope.

## Scope and limitations

This is a research executor plus support APIs, not an interactive pipeline UI or default release. Context preparation uses bounded deterministic filename ranking/previews; diagnostics are heuristic. Each model stage has a fresh archived session. Runbooks validate supplied receipt structure and freshness, not an arbitrary caller's honesty. There is no automatic log retention cleanup, learned router, permanent model manager, automatic task-boundary reset, wholesale tool replacement, automatic skill/plugin loading or hidden model calls.

The authorized light Sonion comparison is documented in `benchmark/pipeline-plan.md`; results are reported separately under `reports/pipeline-bench-v1`. It compares complete systems and does not isolate each feature. Fleet batching, effort scheduling and promoted runbooks are locally tested, not exercised by the single-task comparison. Local harness source is canonical; remote parity is verified by hashes and all benchmark evidence is copied back.

See [usage and configuration](../../docs/PIPELINE.md) and [preservation receipt](verification.json).
