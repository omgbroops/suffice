# Luna model-only historical calibration

Snapshot: 2026-10-15T08:17:33.406709+00:00. Completed: True.

Luna independently accepted 2/10 attempts; 2 were accepted within all recorded allowances. Total inference estimate: $0.035286; unknown-cost attempts: 0.

On 10 matching source/prompt/private-contract cases, the existing Sol reference accepted 10; total estimate $0.540464. Luna was run later using the same Suffice architecture, with only the selected model changed. There were no new Sol or Astra benchmark calls.

API-equivalent inference estimates under subscription access, not invoice charges or measured energy; all attempts included, unknown costs remain unknown.

Exposed historical calibration with one attempt/model/task and unrandomized later Luna execution; no fresh holdout, Astra measurement, or causal harness improvement claim.

| Subset | Attempts | Accepted | Budget eligible accepted | Complete cost | All-attempt cost / accepted |
|---|---:|---:|---:|---:|---:|
| primary | 4 | 0 | 0 | $0.012522 | n/a (no accepted task) |
| secondary | 6 | 2 | 2 | $0.022764 | $0.011382 |
| all | 10 | 2 | 2 | $0.035286 | $0.017643 |

| Task | Subset | Luna status | Accepted | Sol accepted | Replies | Luna cost | Sol cost | Source/prompt/contracts match |
|---|---|---|---:|---:|---:|---:|---:|---:|
| s01 | primary | completed | False | True | 7 | $0.002066 | $0.042819 | True |
| i01 | primary | completed | False | True | 9 | $0.003935 | $0.052239 | True |
| q04 | primary | completed | False | True | 7 | $0.002231 | $0.059553 | True |
| i03 | primary | completed | False | True | 9 | $0.004289 | $0.046146 | True |
| s02 | secondary | completed | True | True | 12 | $0.004826 | $0.045362 | True |
| s03 | secondary | completed | False | True | 11 | $0.003358 | $0.064351 | True |
| i02 | secondary | completed | True | True | 10 | $0.003650 | $0.069176 | True |
| i04 | secondary | completed | False | True | 9 | $0.003225 | $0.035008 | True |
| q01 | secondary | completed | False | True | 12 | $0.003852 | $0.060657 | True |
| q02 | secondary | completed | False | True | 11 | $0.003854 | $0.065153 | True |

The original four cases remain primary; all ten were declared before any Luna actor request. The six additions are reported separately. All model-free original-native/original-fails/reference-passes controls must be valid; q04 uses the separately hashed source-only reference completion bridge after the frozen evaluator rejected redundant referencePatch metadata. No grading contract or actor patch was changed to make a result pass.

Receipt checks: 10/10 complete request/reply/raw-usage reconciliations; 10/10 exact Luna-low identity/tool checks; 10/10 independently recomputed startup-price checks. Missing raw model identity, where the observer does not emit it, remains separate from verified request/finalized-reply identity.

Actor-created test edits are archived but excluded from independent acceptance. Frozen acceptance is evidence for its tested contracts, not proof of every behavior. Native timing sensitivity, especially q02, needs the baseline controls and main adjudication notes; no outcome is silently replaced after a post-hoc replay.

One separate Sol-low live l03 repair continuation may overlap this serial Luna campaign; same Sonion CPU affinity 0,1. Keep timestamps for actual overlap.

No model or harness optimization is selected by this report. Any development use of failed tasks must remain distinct from a new, independently contracted confirmatory cohort. Cost savings accompanied by lost acceptance do not establish an accuracy-preserving gain.

Request totals: 97 provider-request intents, 97 finalized replies, 97 deduplicated raw usage responses. All used exact GPT-6 Luna low. No provider-response errors, missing totals, or coding-attempt replacements are hidden by the aggregate.

The copied evaluator lacked its referencePatch-only setup branch for q01/q02. Their first preflights stopped before actor inference. A separately hashed bridge applied the frozen patches only to validated existing production paths in fresh physical workspaces, rejected traversal/test/metadata/symlink targets, normalized dependencies and passed unchanged native/private checks. The old blocked state and logs remain preserved. Only then were their first actor attempts launched; no failed coding attempt was retried.

Separate Sol-low live l03 repair ran 2026-10-15T07:44:32.512Z–2026-10-15T07:45:25.485Z; overlap with Luna actor windows: [{'task': 's01', 'seconds': 28.954}, {'task': 'i01', 'seconds': 0.953}]. Final hashes show 0 variant-runtime mismatches and 0 original-frozen mismatches across 14 inputs each. Model-free control command wall time totals 646.0 seconds, separately from actor execution; this is not an aggregate CPU or energy measurement.

The i03 general type declaration says Iterable, while its README equivalence uses Array.from. Root separately verified that original issue #110 explicitly requires preserving array-like runtime support and immediate iterator-error rejection, resolving the issue-specific grading scope. The primary array-like failure remains recorded. A separate post-hoc diagnostic omitting only that assertion found the Luna patch repaired the earlier scheduled-rejection examples but failed the later immediate iterator-settlement check; the reference passed. Primary grades were never rewritten.

Both queue patches pass all issue-specific private assertions but fail preservation obligations. Q01 additionally leaves an unread private field (TS6133), a deterministic compile failure. Q02 emits `next` on dequeue and fails the original synchronous completion-event count assertion (1 instead of 0) at test/advanced.ts:176; this is a concrete regression, not the separate baseline-reproduced timing flake documented for a main-campaign replay. See FAILURE-TAXONOMY.md for actual trace lines and grader artifacts.
