# Revision-aware evidence record: completed bounded investigation

October 14, 2026. Branch `experiment/evidence-record`, original snapshot `37fb5e2`. This implementation did not improve efficiency or demonstrate a capability gain. Every scored control already passed. Adding the record increased mean API-equivalent inference cost **85.2%**; adding requirement-directed checks increased it **105.5%** on the same five matched groups.

| Scored arm | Independently accepted patches | Completed within $0.12 total inference allowance | Mean API-equivalent inference | Mean actor time |
|---|---:|---:|---:|---:|
| A: Sol low + navigation + ordinary bounded executable checks | 5/5 | 5/5 | $0.0275172 | 31.49 s |
| B: A + revision-aware evidence record | 5/5 | 5/5 | $0.0509652 | 38.69 s |
| C: B + explicit requirement/provenance-directed checks | 5/5 | 5/5 | $0.05653968 | 45.11 s |

All five scored groups have complete cost telemetry. These are observed small-cohort differences, not a general cost frontier or causal latency estimate. Concurrency elsewhere on the PC/provider, cache warmth, differing trajectories and historical training contamination remain limitations. Engineering-agent inference and postcampaign model-free replay are excluded; these figures are not subscription billing or total project spending.

## What was compared

All arms use the pinned Pi 1.2.0 stack, GPT-6.1 Sol configured at low effort, syntax navigation and append-only conversation history. A/B/C have the same generic Node behavior-test executor: four novel bodies and eight total executions, including reruns. C's requirement_check uses that SAME executor and SHARED allowance. A/B are free to run novel checks; verification capability is not withheld from control. There are no added models, reviewers, delegation, embeddings, pruning, rollback, effort switches, dependency installations or shared runtime changes.

The shared TOTAL per-attempt inference ceiling is $0.12 known API-equivalent usage, 18 assistant generations, 100 tool calls and 180 seconds. Test design and repair consume this same allowance. Known spending is checked between generations; a final in-flight generation can overshoot. Overshoots and unknown totals are never within-budget successes. Final hidden acceptance and complete frozen public regression run independently after every actor, without feeding diagnostics back into repair.

B/C store model-authored requirements, public citations, evidence links, assumptions and unresolved questions. Code records actual source reads, full editable-source revisions, test source hashes, actual subprocess outcomes, Node identity and start/end revisions. Source or test changes invalidate old receipts conservatively. Edits and tests serialize in every arm; raced reads remain stale. Existing messages are not rewritten. Full records remain append-only outside context, with compact fresh observations returned on request.

Each attempt starts with an empty in-memory record and persists within-task evidence. This does not test restart recovery, warm cross-task reuse, long-term memory or every persistent-evidence architecture.

## Difficulty, activation and freeze history

Pilot-v1 had four attempts: yocto-queue drain(undefined) A/B/C and p-map source-close A. They all passed, costing $0.1244296 known total. B/C actually accessed the record; C executed two novel behavior checks. This activation pilot had generic execution only in C, so its arm costs cannot isolate policy from added execution capability. Its original frozen runtime is preserved.

A separate fair-executor screen used the substantially larger p-map read-ahead/mapper-slot scheduling task, with one A/B/C attempt. Its 524-line production file couples input pulls, mapper slots, backpressure, early stop and cleanup. All three patches passed independent checks, so this also failed to establish a difficult baseline failure. A completed at $0.0642296 within budget. B's known lower bound was $0.1375628 and a recovered 503 left its total unknown; C completed at $0.1302484. Both are ineligible under $0.12 despite accepted patches. The provider failure and both overshoots remain in accounting.

The separate 15-attempt scored schedule was frozen before those larger-screen outcomes. Unused scored-v1 was never executed. Scored-v2 changed only model-invisible exact returned-source hashing, durable live event logging and its campaign label; task, prompt, schedule, model, arm, budget, baseline and grader bytes stayed identical. Both freezes remain. [Amendment receipt](evidence-freeze-amendment.json).

Scored tasks span three repositories: quick-lru per-item duration overrides (two repetitions), p-map promised-input positional indices (two), and eventemitter3 recursive once listeners (one). Seven screening/activation attempts and fifteen scored attempts exhaust the 22-attempt cap. No prior blocked recovery work or prior hidden failures were reused. Prompts are investigator-authored expanded contracts derived from public historical fixes/docs, not untouched issue prompts. Original public p-map issue #78 is saved separately from the expanded scheduling requirements. [Task/issue provenance](evidence-task-provenance.json).

Every original task fails the frozen hidden checks, its public upstream reference passes, and both original/reference pass public regressions. Hidden final task checks and complete frozen public regression are identical across arms. The regression suites are small investigator-authored Node suites, **not original upstream AVA/Mocha suites**; unavailable upstream dependencies were not installed, and upstream suites were not credited as passes. These results establish bounded-check acceptance, not unrestricted repository correctness.

## Did the record change behavior?

| Scored observation | A | B | C |
|---|---:|---:|---:|
| Exact source read observations | 22 | 29 | 29 |
| Exact repeated path/range/returned-text reads | 0 | 2 | 0 |
| Explicit record reads / updates | 0 / 0 | 5 / 8 | 7 / 9 |
| Fresh evidence items exposed by record_read | 0 | 28 | 43 |
| Later link citations after fresh record exposure, with no intervening edit | 0 | 0 | 9 |
| Novel executable bodies / total generated executions | 5 / 5 | 5 / 5 | 9 / 9 |
| Generated assertion failures | 0 | 0 | 1 |
| Source edits after those failures | 0 | 0 | 0 |
| Final active links stale | — | 0/5 | 0/5 |
| Final active links containing unresolved caveats | — | 5/5 | 4/5 |
| Record freshness diagnostic eligible | — | 0/5 | 1/5 |

Fresh exposures are not demonstrated semantic reuse. Later citations are an observable reference reuse, still not proof that the cited evidence entails a requirement. Exact repeats exclude partially overlapping reads; old pilot/screen counters use weaker proxies and are not pooled into this table. [Definitions and per-attempt metrics](evidence-mechanism-metrics.json).

The record activated, but baseline had no exact-repeat problem to rescue. C executed more relevant behavior tests, including stateful and boundary cases; no scored valid new implementation defect was discovered and repaired. Its one assertion failure came from an incorrect cache-rotation eviction-callback expectation. The actor recognized the invalid test and replaced it; no source repair followed. This must not be credited as finding a product defect.

The larger screen exposed further semantic limits. A B-arm generated test demanded exactly concurrency outstanding source pulls although the public contract supplies an upper bound. That is an invalid saturation expectation. Several generated checks assumed return() interrupts an async generator's never-settling first next(); the public reference times out and does not promise this stronger cancellation behavior. Only 17/33 generated sources pass the public reference. This is not a 16-invalid-test count. Sixteen disagreements include valid expanded-contract edges: the quick-lru reference expires -Infinity while the authored finite/infinite-age contract requires nonexpiration; the emitter reference double-invokes a once listener from an outer stale dispatch snapshot. A separate posthoc sensitivity replay checked the two specific scenarios against every relevant scored patch: all six quick-lru patches and all three emitter patches passed. Both original and historical reference versions failed those expanded cases. These are expanded-task/reference disagreements, not automatically claims about current upstream defects. [Supplemental sensitivity receipt](evidence-supplemental-sensitivity.json). Other disagreements are the demonstrably invalid callback/saturation expectations or unresolved stronger cancellation assumptions above. Reference agreement/disagreement is not semantic proof, and none of these postcampaign diagnostics rewrites primary scores or establishes a treatment rescue. [Generated-check semantic review](evidence-generated-check-triage.json) preserves the distinction.

Freshness is a diagnostic, **not an enforced completion gate**. Operational completion and primary acceptance never depend on freshnessEligible. Actors removed/superseded stale active links, but usually retained bounded-verification or unavailable-hidden-check caveats and still terminated. B had five warning reads and no subsequent update/check; C had five and one subsequent update, no subsequent check. There were zero scored completions contradicted by independent acceptance. This does not prove all semantic requirements were covered or every natural-language claim supported. Blindly enforcing the current caveat flag would reject nine otherwise accepted scored patches. The implementation does not establish that the model knows semantic evidence is sufficient.

## Verification and capability boundary

Five policy tests pass: source/test mutation invalidation, unrelated-source conservative invalidation, raced receipt/stale read diagnostics, unknown IDs/unverified provenance, and shared generic/directed executable limits. A stale receipt cannot make the record freshness diagnostic eligible after a source change. This is not a model termination guarantee.

Model-free postcampaign verification reconstructs saved baseline + patches, verifies frozen hashes/models/cost sums/check identities, reruns identical hidden acceptance and public regression, and executes every generated body against pinned original/reference/final code. Its scope is independent of repair actors but it is authored by the same engineering investigation, not a blinded independent team. The canonical replay passed all 22 identical hidden/regression pairs and 594 integrity checks, with all 33 generated sources retained and rerun; its model-free wall time was 176.364 seconds, outside actor timing. [Canonical replay receipt](evidence-independent-audit.json). [Isolated exported-layout replay receipt](evidence-export-verification.json) is supplied separately.

Correction after scored-v2 launch: no explicit network tool does **not** establish network isolation. A parent Node24.15 --permission probe succeeded against a local loopback HTTP server, with no remote traffic or model calls. Generated Node bodies could therefore fetch solutions despite filesystem restrictions. Static review of all 126 saved actor tool programs and 33 generated Node sources found zero observed fetch/http/net/child-process/solution-retrieval patterns. This is not packet instrumentation or a proof against obfuscation. No frozen benchmark/task/prompt/source bytes were changed by the reporting correction. [Local-only probe](evidence-parent-network-boundary.json), [saved-program audit](evidence-network-audit.json), [dated correction](evidence-network-correction.json).

## Accounting, artifacts and reproduction

Across all 22 attempts, all 22 patches passed the bounded independent checks; all actors operationally completed. **20/22 are known within-budget successes**. Known API-equivalent inference is **$1.1315808**, a lower bound with **one unknown total**. Engineering inference is excluded. No more repair calls are scheduled. The $3 known-cost, 22-attempt, 100-MiB artifact and 1-GiB free-space limits are retained; [Resource receipt](evidence-resource-receipt.json) is supplied separately.

This is a negative efficiency result for this within-task record implementation and workload. There is no demonstrated capability gain: both easy and larger screened baselines passed, and C never rescued a baseline failure. Keep the simpler baseline unless a new workload presents real evidence-reuse or requirement-coverage failures under comparable total budgets. Typed caveats and requirement/check mapping validity need evaluation before turning freshness into a stopping rule. Do not train a decision policy from these few mostly successful trajectories.

[Machine-readable outcomes/costs](evidence-results.json), [protocol](../docs/REVISION-EVIDENCE.md), [model metadata](evidence-model-metadata.json), [portable evidence file list](evidence-export.json).

Prerequisites: Node24.15 and existing package-lock-pinned project dependencies. No live model access is needed for audit. From this worktree or exported layout:

```powershell
node --test tests/revision-evidence.test.mjs
node scripts/audit-evidence.mjs --out=reports/my-audit.json
node scripts/audit-evidence-network.mjs
```

The audit uses fresh timestamped reconstruction directories and exclusive report creation. It reads saved baselines/frozen graders/patches and resolves generated checks locally, ignoring stored machine-specific absolute paths and original actor workspaces. Reproduction of live campaigns additionally requires the authorized existing Pi subscription; do not rerun frozen campaign names with changed inputs. Full pinned acquisition commands and freeze/run commands are in the protocol.
