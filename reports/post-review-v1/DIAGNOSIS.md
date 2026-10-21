# Saved failure diagnosis — review before new inference

This analysis covers the 30-task/four-arm comparison, five-task/four-arm pilot,
and four-task/eight-arm calibration. The parent `suffice-experiments` directory
exists, but the authoritative reports for these campaigns are in this Suffice
checkout, and the full actor receipts are in Sonion's existing WSL campaign
directories. No relocation or new model execution was needed.

`failure-inventory.json` inventories **48 unsuccessful records**, including eight
excluded infrastructure originals. Forty-seven have saved worker receipts; V1's
original Doom outer timeout lacks its terminal worker receipt. The inventory reads
actor-only events and final statements plus already-published outcome metadata.
It records file hashes and distinguishes actor claims from verified observations.
It never opens verifier scripts/logs, hidden tests, solutions, or reward details
beyond the existing public report's pass/fail/ungraded labels.

These categories overlap. They describe supported contributing mechanisms, not
a proven explanation for each official rejection:

| Category | Records with an observed signal or actor admission | Limits |
| --- | ---: | --- |
| Reasoning / incomplete solution | 5 | Actor admits approximation, runtime/test failure, or inferred recovered data. This does not isolate the underlying cognitive cause. |
| Misunderstood or incompletely fulfilled requirements | 3 | Two deferred installations and content classification without inspecting PDFs. |
| Verification gaps | 32 | Includes no configured controller check and public-pass/independent-fail disagreement; no configured check does not imply the actor ran no tests. |
| Tool / scope issues | 5 | Repository restrictions, missing PDF extraction, and polyglot interpreter/invocation mismatch. |
| Provider failures | 4 | Operational/provider or incomplete-usage signal; not every transport root cause is established. |
| Grading problems | 11 | Six excluded permissions failures and five original verifier timeouts. Later HTML replays are separate evidence. |

For **32 graded records**, an additional reasoning label is explicitly
**unresolved**. Those are not counted as 32 demonstrated reasoning errors.
Independent rejection and a confident final answer do not establish root cause.
The matrix at the end maps every unsuccessful attempt to its evidence labels.

## Recurring causes supported by public actor evidence

### Requested installed state was deferred

Original V1 configure-git-webserver says it did not create `/git/server` or leave
the server running because writes were restricted. Original V1 nginx-request-logging
left system installation pending and served a temporary instance. These statements
directly support a mismatch between repository-oriented guidance and an isolated
environment task. V2 configure-git-webserver also reports a setup script and syntax
check, rather than demonstrating the installed service. Its exact rejection cause
is not established by that statement alone.

The later isolated-task guidance addressed this mechanism but did not improve
aggregate acceptance in the pilots and cost more in refined V1. Retain that negative
result. Do not generalize the diagnosis into loosening all repository file guards.

### Known incomplete work could still finish normally

V2 path-tracing reported similarity about 0.65 against the public 0.99 requirement.
Path-tracing-reverse admitted an approximation without verifying equivalence.
V2 Doom reported VM termination with no frame output. V2 build-cython-ext reported
a remaining test failure outside the two test files explicitly excepted by the
public task. V2 financial-document-processor did not inspect six PDFs and placed
them into the other category anyway. These cases contain useful public evidence
for an external reviewer; they do not require hidden grader details.

Some of these are difficult implementation problems. A short Sol review may detect
incompleteness without being able to repair it within one Luna pass. Success is
not guaranteed by adding review.

### Smoke checks could reward the wrong completion signal

The clearest trace is concise V2 WAL recovery: the final statement admits that the
WAL disappeared after an initial SQLite access and that missing rows were inferred.
The public check still passed. The public requirement was recovery of original
data, not merely plausible rows of the expected shape. This supports both an
implementation/evidence problem and inadequate public verification.

Other calibration failures, including gRPC and HTML, also passed public checks.
Their precise code defects remain unresolved here. We have not invented a private
edge case to explain them. Expensive HTML runs reported many candidate-authored
tests and still failed; counting self-authored cases is not a correctness measure.

The broader V2 campaign configured controller checks on only 3/30 tasks. In the
latest calibration, selective assistance never activated despite independent
rejections. The failure trigger lacked usable evidence. The five-task pilot did
activate a takeover, so the mechanism was not universally broken.

### Environment evidence was mistaken for a code failure

In the polyglot pilot, fixed controller invocation lacked system python3 while
actors used a portable interpreter via command-local PATH changes. This caused
paid repairs without establishing a numerical defect. V1's extra repair cost
$0.031034. V3's read-only delegate also lacked permission to inspect the checker
outside its scope. All four reconstructed source artifacts passed 38 public cases
in both languages with an explicit interpreter; official scores remain unchanged.
Missing interpreter alone cannot explain the independent rejection because Pi
was accepted with a similar local PATH adjustment.

### Infrastructure outcomes need their own accounting

Provider interruptions include subscription-service unavailability and a stream
ending without terminal usage. We preserve unknown costs and do not infer a code
failure from them. Six earlier receipt permission errors were grading/export
problems. Five original verifier timeouts were not patch rejections. The HTML
resource probe suggested browser/process/memory exhaustion but did not establish
its origin. Regrading Luna-alone returned a rejection; upfront/selective timed out
again. No source repair was made from that feedback.

## What remains unknown

Several Sol/Pi failures report successful public tests, including image segmentation,
SQL optimization, and the Doom build. Exact reasons for their independent rejection
are unestablished without additional public reproductions. FastText's visible
accuracy was narrowly above the public requested threshold, but that does not
demonstrate generalization to another sample. We do not inspect the private sample.
For gcode-to-text, the final string by itself is insufficient to determine why the
interpretation failed. These are explicitly unresolved rather than asserted model
or harness defects.

## Information boundary

This inventory is an offline research artifact. It is not mounted, loaded as
guidance, used as a skill, or included in future actor/reviewer prompts. Old task
names and outcome labels are used only for cohort exclusion and analysis. The new
reviewer receives the new task, its own actual source changes, and public check
evidence. It receives no historical grades, hidden cases, reference solutions, or
failure-specific patches. Frozen cohorts remain untouched.

## Implication for the one proposed strategy

Review should run even after a public pass. It should compare the actual diff to
the original requirements and ask for concrete corrections. This can address
observable incomplete fulfillment and unsupported completion claims. It cannot
replace execution evidence, fix infrastructure automatically, or establish hidden
correctness. Measure acceptance per dollar including review, failed repairs, and
review-induced regressions.

## Attempt matrix

Labels are non-exclusive. `unresolved` is an uncertainty marker, not an established
reasoning defect. Evidence paths and SHA-256 hashes are in `failure-inventory.json`.
No original verdict is changed.

| Cohort | Task | Arm | Excluded original | Supported mechanism labels | Uncertainty |
| --- | --- | --- | --- | --- | --- |
| harnesstax-sol61-v1 | adaptive-rejection-sampler | codex | no | provider failures | reasoning/root cause unresolved |
| harnesstax-sol61-v1 | build-cython-ext | v2 | no | verification gaps, reasoning | exact official rejection cause may remain unresolved |
| harnesstax-sol61-v1 | configure-git-webserver | pi | no | none established | reasoning/root cause unresolved |
| harnesstax-sol61-v1 | configure-git-webserver | v1 | no | verification gaps | reasoning/root cause unresolved |
| harnesstax-sol61-v1 | configure-git-webserver | v2 | no | verification gaps | reasoning/root cause unresolved |
| harnesstax-sol61-v1 | configure-git-webserver | codex | no | none established | reasoning/root cause unresolved |
| harnesstax-sol61-v1 | financial-document-processor | v2 | no | verification gaps, tool/scope issues, misunderstood requirements | reasoning/root cause unresolved |
| harnesstax-sol61-v1 | gcode-to-text | v2 | no | verification gaps | reasoning/root cause unresolved |
| harnesstax-sol61-v1 | make-doom-for-mips | pi | no | none established | reasoning/root cause unresolved |
| harnesstax-sol61-v1 | make-doom-for-mips | v1 | no | none established | reasoning/root cause unresolved; missing terminal receipt |
| harnesstax-sol61-v1 | make-doom-for-mips | v2 | no | verification gaps, reasoning | exact official rejection cause may remain unresolved |
| harnesstax-sol61-v1 | make-doom-for-mips | codex | no | none established | reasoning/root cause unresolved |
| harnesstax-sol61-v1 | path-tracing | v2 | no | verification gaps, reasoning | exact official rejection cause may remain unresolved |
| harnesstax-sol61-v1 | path-tracing-reverse | v2 | no | verification gaps, reasoning | exact official rejection cause may remain unresolved |
| harnesstax-sol61-v1 | query-optimize | v2 | no | verification gaps | reasoning/root cause unresolved |
| harnesstax-sol61-v1 | query-optimize | codex | no | none established | reasoning/root cause unresolved |
| harnesstax-sol61-v1 | sam-cell-seg | codex | no | none established | reasoning/root cause unresolved |
| harnesstax-sol61-v1 | sam-cell-seg | pi | no | none established | reasoning/root cause unresolved |
| harnesstax-sol61-v1 | sam-cell-seg | v1 | no | verification gaps | reasoning/root cause unresolved |
| harnesstax-sol61-v1 | sam-cell-seg | v2 | no | verification gaps | reasoning/root cause unresolved |
| harnesstax-sol61-v1 | torch-tensor-parallelism | v2 | no | grading problems, verification gaps | exact official rejection cause may remain unresolved |
| harnesstax-sol61-v1 | torch-tensor-parallelism | codex | no | grading problems | exact official rejection cause may remain unresolved |
| harnesstax-sol61-v1 | torch-tensor-parallelism | v1 | no | verification gaps | reasoning/root cause unresolved |
| harnesstax-sol61-v1 | train-fasttext | v2 | no | verification gaps | reasoning/root cause unresolved |
| harnesstax-sol61-v1 | video-processing | v2 | no | provider failures, verification gaps | reasoning/root cause unresolved |
| harnesstax-sol61-v1 | video-processing | codex | no | none established | reasoning/root cause unresolved |
| harnesstax-sol61-v1 | nginx-request-logging | v1 | no | verification gaps, tool/scope issues, misunderstood requirements | reasoning/root cause unresolved |
| harnesstax-sol61-v1 | merge-diff-arc-agi-task | v1 | yes | grading problems, verification gaps | exact official rejection cause may remain unresolved |
| harnesstax-sol61-v1 | merge-diff-arc-agi-task | v2 | yes | grading problems, verification gaps | exact official rejection cause may remain unresolved |
| harnesstax-sol61-v1 | multi-source-data-merger | v2 | yes | grading problems, verification gaps | exact official rejection cause may remain unresolved |
| harnesstax-sol61-v1 | multi-source-data-merger | v1 | yes | grading problems, verification gaps | exact official rejection cause may remain unresolved |
| harnesstax-sol61-v1 | nginx-request-logging | v1 | yes | grading problems, verification gaps, tool/scope issues, misunderstood requirements | exact official rejection cause may remain unresolved |
| harnesstax-sol61-v1 | nginx-request-logging | v2 | yes | grading problems, verification gaps | exact official rejection cause may remain unresolved |
| refinement-pilot-v1 | polyglot-c-py | v2 | no | tool/scope issues, verification gaps | reasoning/root cause unresolved |
| refinement-pilot-v1 | polyglot-c-py | v3 | no | tool/scope issues, verification gaps | reasoning/root cause unresolved |
| calibration-v1 | kv-store-grpc | v2-selective | no | verification gaps | reasoning/root cause unresolved |
| calibration-v1 | filter-js-from-html | v1-concise | no | verification gaps | reasoning/root cause unresolved |
| calibration-v1 | filter-js-from-html | v2-alone | no | grading problems | exact official rejection cause may remain unresolved |
| calibration-v1 | filter-js-from-html | v2-upfront | no | grading problems | exact official rejection cause may remain unresolved |
| calibration-v1 | filter-js-from-html | v2-selective | no | grading problems | exact official rejection cause may remain unresolved |
| calibration-v1 | filter-js-from-html | v2-concise | no | verification gaps | reasoning/root cause unresolved |
| calibration-v1 | filter-js-from-html | pi | no | verification gaps | reasoning/root cause unresolved |
| calibration-v1 | filter-js-from-html | v1-original | no | verification gaps | reasoning/root cause unresolved |
| calibration-v1 | db-wal-recovery | v2-upfront | no | verification gaps | reasoning/root cause unresolved |
| calibration-v1 | db-wal-recovery | v2-concise | no | verification gaps, reasoning, verification gaps | exact official rejection cause may remain unresolved |
| calibration-v1 | filter-js-from-html | v1-refined | no | verification gaps | reasoning/root cause unresolved |
| calibration-v1 | kv-store-grpc | v1-refined | yes | provider failures | reasoning/root cause unresolved |
| calibration-v1 | filter-js-from-html | v1-refined | yes | provider failures | reasoning/root cause unresolved |
