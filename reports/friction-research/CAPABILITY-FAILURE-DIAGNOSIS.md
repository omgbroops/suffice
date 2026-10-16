# Offline capability diagnosis and evaluation ledger

Scope: pure file analysis, 2026-10-14. No inference, program execution, regrading, recovery implementation, or blocked follow-up retry. Read saved outcomes as receipts; all acceptance observations below are historical. Hidden tests were read only for evaluator-side diagnosis and must not become actor-facing prompts. Own report files only were written.

## Strongest correction to broad failure descriptions

All four LRU attempts fail the same **status.oldValue identity assertion**, and all four immutable-finalizer attempts fail the same **YAMLException.reason string assertion**. These are real benchmark rejections, but the current reports overgeneralize their granularity. Neither demonstrates broad failure of disposal, finalization or aliases. A test aborts at its first failing assertion; later assertions within that test remain unexamined.

### LRU background lifecycle

Public task: `../adaptive-effort/benchmarks/adaptive-lru/task.json`, prompt field. It explicitly requests synchronous returns, placeholder suppression, no self-abort, stale-relative status/callback classification, unchanged-value nondisposal and eviction/late-result correctness. It does not spell out `status.oldValue` on unchanged updates.

Saved exact-source exposure: `../adaptive-effort/.suffice/adaptive-runs/state-screen/0-lru-background-lifecycle-low/execution/solo/transcript.json`, assistant messages 4/6/8 (zero-based): symbol discovery, symbol_read of backgroundFetch/set/evict and raw lines 2140..2267, 2428..2582 and 3020..3149. These are source-delivery receipts; they establish availability, not attention or hidden thought. Directory-symbol EISDIR preceded successful narrower retrieval.

Visible coverage: `.../workspace/tests/visible.test.mjs`, three tests. Ordinary same-value set is covered; stale-fetch completion returning the identical object is absent. New fetch/no placeholder and shared fetch/delete are covered. The ordinary test does not inspect status fields.

Implementation evidence: saved `.../execution/final-checks.json`, patch hunk around source lines 2235..2241, sets `status.oldValue` only when `reason === 'replace'`. The implementation recognizes stale values and updates classifications, but omits oldValue for updates. Thus this is an observable implementation choice, not a missing-source claim.

Historical independent acceptance: all four `../adaptive-effort/.suffice/adaptive-runs/state-*/*/tests.json` show 5/6 and the same `undefined` versus `{id:1}` failure at `benchmarks/adaptive-lru/acceptance.test.mjs:5:667`. Within that test, resolved-value identity, empty dispose/disposeAfter, signal not aborted and status.set='update' assertions occur **before** oldValue and therefore passed. The final onInsert-reason assertion occurs after it and is unexamined by that failing test. Avoid saying these receipts prove disposal of an unchanged value. Separate other passing tests cover replacement disposal and stale eviction.

Trigger: `../adaptive-effort/reports/ADAPTIVE-EXPANDED-RESULTS.md` states two visible regression failures at different edit versions or nine pre-edit messages. All visible checks pass and edits start before nine messages. No switch occurred. Generated scenario failures are excluded. This diagnoses unobserved failure evidence and inactive treatment, not escalation ineffectiveness. Fixed medium also failed this exact assertion in one replication.

### Immutable finalizers

Public task: `../failure-recovery/benchmarks/recovery-post-reset/tasks.mjs:3`. It requests mutable carriers finalized into immutable results, completed alias identity, recursive custom-carrier rejection, empty/nested behavior, identity-placeholder skipping, and finalizer errors at collection start with filename/source location. It does **not explicitly require verbatim preservation of error.reason**.

Exact-source exposure: `../failure-recovery/.suffice/recovery-runs/pilot-post-reset-v2/002-immutable-finalizers-rollback-r0/execution/transcript.json`, assistant message 4 reads tag.ts, schema.ts, parser/constructor.ts and parser/events.ts; message 6 reads constructor lines 210..439 and visible tests. Message 10 reads constructor again then constructs a wrapper prefix `cannot finalize collection ...`. This is evidence of relevant code availability and deliberate emitted implementation behavior, without inferring reasoning.

Visible suite: `../failure-recovery/.suffice/recovery-post-reset-fixtures/immutable-finalizers/baseline/tests/visible.test.mjs`, seven ordinary regression checks. None tests custom finalizer failures or identity placeholder skipping. Actor-generated checks in representative transcript messages 8/12 cover successful finalization, nesting, empties, alias identity and recursion; no throwing finalizer is requested there.

All four finalizer `.../pilot-post-reset-v2/*/tests.json` record hidden 3/4, visible 7/7 and upstream 258/258. Failure is exact reason mismatch: normal r0 prefixes `cannot finalize collection with !<!immutable>: `; other three prefix `cannot finalize collection !<!immutable>: `; grader expects `finalizer failed`. Acceptance source `../failure-recovery/benchmarks/recovery-post-reset/immutable-finalizers.test.mjs:7` checks YAMLException instanceof first, then reason, then filename/line/column, then identity placeholder behavior. Instanceof passes; location and placeholder checks in that failing test are not reached. They cannot be described as independently validated or failed from this receipt. Three other hidden tests pass alias identity, nested/empty finalization and recursive alias behavior.

This is partly a grader/public-contract specificity question. Existing API conventions or a historical reference may justify verbatim reason preservation, but this analysis has not established that requirement from public API documentation. Do not equate strict acceptance mismatch with proven failure of the explicitly worded source-location requirement. Preserve original score and qualify interpretation.

Trigger: six pilot results record zero rollbacks; representative rollback result records one failed state and two checkpoints. The two-failed-state trigger is per attempt. Passing observed regressions and selected scenario cases do not create the missing second failure observation. No causal rollback efficacy result exists. Prepared later tasks are unrun, not failed recovery evaluations.

## Dataset and evaluation ledger

Machine-readable companion: `CAPABILITY-EVALUATION-LEDGER.json`. Inventory is from root `reports/CONTEXT-WASTE-AUDIT.json` and `RESEARCH-FINDINGS.json`: 347 result records, 345 attempts, two nonattempt summaries, 266 attempts with transcripts / 296 actor transcripts, 999 saved input manifests. Counts are attempts, not unique tasks or independent decision opportunities. 208 attempts have acceptance recorded (173 accepted, 35 rejected); 137 lack recorded acceptance. Missing acceptance is not rejection. 303 complete reported cost totals; unknown usage must remain unknown. The audit labels only eight attempts explicit hard screen; 337 are not difficulty calibrated. Generic completion success and independent acceptance differ.

Development: pilots, smoke checks, context screens and infrastructure checks were used to select/tune/evaluate behavior; preserve as development evidence. Screened: LRU state-screen low establishes selection; state-comparison medium/adaptive/repeated-low uses that same selected task. Recovery pilot is a screened small cohort with repeated finalizer task. Historically scored: sol-tools, architect YAML, cache retention, test execution, evidence and retrieval scored labels describe original protocols, not a fresh future holdout guarantee. The offline 40-packet retrieval tournament is not 40 live repair traces.

Untouched: zero task sets are certified as both unused and inaccessible to this research from these inspected artifacts. This is absence of certification, not proof no untouched dataset exists. Do not retroactively relabel archived scored runs as development for their original experiment; they are now exposed for future evaluation design. Archival evaluator exposure alone is not evidence the repair actor saw hidden tests. Before a future claim, freeze a separate task-level ledger with original public prompt, source revision, selection date, actor/evaluator exposure, task-family overlaps and untouched split ownership; this report does not create or launch that experiment.

## Coverage versus unexamined evidence

Confirmed absent coverage: visible stale-same-object fetch status check; visible throwing-custom-finalizer and identity-placeholder checks. Confirmed examined and failing: four LRU oldValue receipts, four finalizer reason receipts. Confirmed examined and passing before failure: unchanged-value disposal/signal and exception class assertions as above. Evidence not examined: detailed trajectories of the other three LRU and other three finalizer actors (their final receipts were inspected), full original upstream documentation, all historical task prompt overlaps, and reference patch rationale. Assertions after a first failure remain unexecuted, not implementation failures. No counterfactual benefit from more retrieval, effort switching, rollback, or a new verification policy is measured. Provider internal reasoning remains unknowable.
