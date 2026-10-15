# Real GitHub field test: frozen Suffice versus native Pi

The requested dataset is complete: **10 historical issues attempted by both agents, plus 3 open issues attempted by Suffice.** This is an external comparison using native Pi 1.2.0, not the earlier restricted direct-tool SDK baseline. All scored requests used GPT-6.1 Sol low.

On the frozen checks, Suffice accepted **10/10**, native Pi **9/10**. Suffice cost **$0.540464**; Pi's known lower bound is **$0.681877**, with two recovered provider responses missing full usage. Thus Suffice used at least **20.7% less API-equivalent inference** across these valid environments, and at least **28.7% less per frozen-check accepted task**, including Pi's coding failure. These are descriptive results for this cohort, not a universal advantage or subscription cash savings.

## Primary historical results

| Metric | Suffice general-v1 | Native stock Pi 1.2.0 |
| --- | ---: | ---: |
| Accepted on frozen native + private checks | 10/10 | 9/10 |
| Accepted with fully verified budget accounting | 10 | 7; 2 more accepted with unknown full costs |
| Total API-equivalent inference | $0.540464 | At least $0.681877; full total unknown |
| Cost per frozen-check accepted task | $0.054046 | At least $0.075764 |
| Recorded model replies, including failed replies | 76 | 142 |
| Model-visible tool invocations | 66 codemode | 153 native tools |
| Primitive tool invocations | 108 | 153 |
| Mean actor execution latency | 88.8 s | 112.5 s |
| Median actor execution latency | 61.1 s | 93.5 s |

Latency includes the agent's own commands and retries, excluding external setup/grading. Independent pairs and preparation overlapped on two remote CPU cores; timing is descriptive. Suffice wrapper plus primitive event counts total 174; native Pi has 153 primitive/model-visible calls. The two counting levels must not be confused.

| Task | Original issue | Suffice | Pi | Suffice cost | Pi known cost |
| --- | --- | --- | --- | ---: | ---: |
| s01 | [sindresorhus/emittery #118](https://github.com/sindresorhus/emittery/issues/118) | Pass | Pass | $0.042819 | ≥ $0.081164 |
| s02 | [nanostores/nanostores #323](https://github.com/nanostores/nanostores/issues/323) | Pass | Pass | $0.045362 | $0.095609 |
| s03 | [nanostores/nanostores #416](https://github.com/nanostores/nanostores/issues/416) | Pass | Pass | $0.064351 | $0.053413 |
| i01 | [node-fetch/node-fetch #1386](https://github.com/node-fetch/node-fetch/issues/1386) | Pass | Pass | $0.052239 | $0.057096 |
| i02 | [node-fetch/node-fetch #1442](https://github.com/node-fetch/node-fetch/issues/1442) | Pass | Pass | $0.069176 | $0.055807 |
| i03 | [sindresorhus/p-limit #110](https://github.com/sindresorhus/p-limit/issues/110) | Pass | Pass | $0.046146 | $0.068064 |
| i04 | [mcollina/fastq #80](https://github.com/mcollina/fastq/issues/80) | Pass | Pass | $0.035008 | ≥ $0.066202 |
| q01 | [sindresorhus/p-queue #251](https://github.com/sindresorhus/p-queue/issues/251) | Pass | Pass | $0.060657 | $0.053950 |
| q02 | [sindresorhus/p-queue #249](https://github.com/sindresorhus/p-queue/issues/249) | Pass | Fail | $0.065153 | $0.092451 |
| q04 | [nanostores/nanostores #371](https://github.com/nanostores/nanostores/issues/371) | Pass | Pass | $0.059553 | $0.058121 |

Suffice was cheaper on 6 tasks by the known-cost comparison and more expensive on i02, s03, q01 and q04. The two unknown Pi totals can only increase its known lower bounds. On the eight pairs with complete cost on both sides, Suffice cost $0.462637 versus $0.534511 (**13.4% lower**). On the seven fully priced pairs that both agents passed, the corresponding totals are $0.397484 versus $0.442060 (**10.1% lower**). These subsets are labeled by cost observability/success, not replacements for the full cohort.

Pi failed q02 because its patch emitted the existing public `next` event when starting work. Original tests require that event on completion. It changed those test expectations locally; independent grading restored the originals. A separate replay reproduced the event failure. This is observed contract reinterpretation despite available source/tests, not evidence that relevant code was never retrieved.

## Cost accounting, operational failures and fairness

| Cost component, known receipts | Suffice historical | Pi historical, lower bounds |
| --- | ---: | ---: |
| input | $0.347258 | $0.426360 |
| cacheRead | $0.045696 | $0.079347 |
| cacheWrite | $0.000000 | $0.000000 |
| output | $0.147510 | $0.176170 |

Input is fresh input; cached input is listed separately. Raw provider usage is deduplicated and reconciled against finalized assistant events. Two Pi replies were terminated and retried successfully (s01 and i04); their missing usage is **unknown, never zero**. Correctness acceptance is kept separate from budget certification. All observed amounts are API-equivalent estimates from recorded pricing, not subscription charges. Engineering-agent inference, power and infrastructure are not included.

The first six integration attempts had an evaluator dependency-container binding error affecting both actors and graders. They remain operationally invalid for comparison, with **$0.459290** retained. All six patches pass corrected diagnostic replay, but that does not retrospectively validate their environments or prices. Both arms were rerun in corrected environments. Including those invalid attempts, historical Suffice spend is **$0.770704** versus Pi **at least $0.910927**. Inclusive cost per accepted task is $0.077070 versus at least $0.101214, or at least 23.9% lower for Suffice.

All main issue attempts, including the 3 initial live attempts and the 6 invalid attempts, have **$1.828268 known inference** and an unknown full total. A separate readiness check cost $0.0095108. One s01 checkout stopped before inference; it cost no observed inference and is preserved. Repair and Luna follow-ups have separate ledgers.

Both arms received identical issue text/user policy, source bytes, dependency closures, Node 24.15.0, per-task $10 ceilings, 60-response/240-observed-call/600-second limits and workspace/OS resource restrictions. First arm was balanced 5/5. Private tests/fixes were outside actor mounts; original tests were restored for grading. Suffice kept its minimal prompt, codemode, navigation and append-only history; Pi kept its native prompt/read/bash/edit/write interface and default retries/cache/compaction. System prompts/tool formats and retry behavior intentionally differ as part of the harness comparison. Some native CI dependencies are omitted or read-only, and Node is newer than several original issues. Those constraints are recorded, not represented as full upstream CI.

The 14 frozen general-v1 inputs and earlier benchmark artifacts are unchanged. Corrections are separately versioned evaluator/host scripts: dependency path normalization, exact physical source copying, root-test restoration and matching network-disabled grading controls. q04's redundant reference-patch metadata required a documented source-only reference-control bridge, before its first actor request. Original v1 records are not overwritten.

## Independent review and open-issue work

The 3 live patches passed the original frozen graders. Independent review supports the scoped Workerpool #596 and p-wait-for #37 fixes. It found a new p-debounce #35 cancellation regression: cleanup for an older leading call removed the listener serving a newer debounce window. The first patch is therefore **not called a completed fix**. One separate Suffice repair passed 77 original tests, types, all 3 unchanged private checks and the independently authored cancellation regression; first plus repair inference totals $0.1036236. Original scores/patches stay intact. All changes remain local for human review; nothing was submitted upstream.

Workerpool's full high-worker-count suite exceeds the unchanged address-space limit. Selected original suites, build/types and a real one-worker integration are validated; full CI/browser/Promises-A+ conformance is not claimed. See `research/field-campaign-v1/audits/live-patch-review.md` and `live-repair-review.md` for reviewed scope and patch paths.

Historical post-hoc reviews are supplementary, not silent changes to frozen grades. Their report is `research/field-campaign-v1/audits/historical-patch-review.md`. The full q02 Suffice replay had a timing-test failure; unchanged baseline also failed that timing test in fixed matched diagnostics. Preserve both observations. Its original frozen native/private grade passed; a source regression was not established. Details: `reports/field-adjudication-v1/assessment.md`.

That historical review confirmed two additional regressions in Pi patches that passed primary checks: s01 permits userland reserved meta-event emission while an internal metadata promise is pending; i04 can loop indefinitely if a worker synchronously pauses during resume/concurrency expansion. Matched baseline/Suffice controls do not show these failures. The upstream i04 reference also hangs on that edge, demonstrating that a reference-positive control is insufficient to prove full API correctness. These findings remain post-hoc audits, not a silently revised 10-versus-9 primary score. The reviewer found no concrete corresponding regression in the submitted Suffice historical patches within its bounded scope.

The i03 array-like compatibility assertion was separately challenged against the narrower Iterable type. A fresh GitHub API body comparison confirmed the original issue explicitly names array-like preservation and verification controls. It is defensible for this issue, while the general API documentation has a domain tension. The separate Luna diagnostic omitting only that assertion is sensitivity evidence, not a changed primary grader. See `audits/i03-arraylike-contract-clarification.md`.

## What this establishes, and what it does not

The earlier efficiency signal survives this larger real-issue cohort: lower recorded inference, fewer model rounds and one primary correctness distinction against native Pi. The architecture is unchanged; the experiment does not isolate whether minimal instructions, codemode, navigation or sampling caused each difference.

These are 10 issues from 6 repositories, with 3 Nano Stores, 2 p-queue and 2 node-fetch issues. They exercise async lifecycles, state transitions, module boundaries and compatibility, but most production fixes remain localized and median execution is about a minute. They are not multi-hour, large-monorepo engineering. One attempt per agent/issue, correlated repository samples, public solution hints, possible model training exposure, incomplete Pi retry usage and limited CI coverage prevent a general superiority claim. No Astra, Codex or Prime head-to-head was run.

Eleven historical packages were prepared; q03 was held before actor exposure following independent contract review because its hidden test demanded cancellation beyond the original cooperative-running contract. Its later cache setup repair does not resolve that contract problem. q04 replaced it before scoring. No issue was dropped because an actor failed or cost more.

The separate exposed-history Luna model-only calibration is under `reports/luna-baseline-v2/`; it is not a fresh confirmatory holdout or an Astra comparison. New mechanisms are not enabled in the baseline.

**Smallest justified decision:** retain the frozen lean baseline, keep independent grading/review, and quantify the cheap-model reliability gap before changing the harness. Treat the observed advantage as evidence for this cohort. Do not turn post-hoc development probes or a passing private grader into a claim that an issue is fully fixed.

Machine-readable results: `RESULTS.json`; independent accounting: `reports/field-accounting/normalized.json`; every original attempt, failed response, patch, control, exclusion and review receipt is preserved in the review bundle.
