# Intelligent test execution — post-reset results

Status: **completed**. 18/18 scored repairs, 4 screening attempts (including the preserved pre-reset quota failure). Cumulative **$1.05807 known API-equivalent inference**, **1 unknown-cost attempts**. User authorized continuation after weekly quota reset; pre-reset reports remain under reports/pre-reset-* and all failed telemetry is retained. These are usage-price estimates, not actual subscription bills.

All live generation uses subscription GPT-6.1 Sol, configured low reasoning, native codemode and existing TypeScript AST navigation. Unrestricted testing executes every request. Fixed scheduling executes the initial request then after two meaningful production edits. Selective scheduling executes unseen source/test revisions; it selects whole executions, not individual cases. Deferred results carry executed:false and never a cached pass. All three arms receive identical prompts/tool schemas and independently execute identical hidden acceptance, public regression and original upstream checks after the agent session closes.

## Difficulty/activation screening

| Campaign / arm | Status | Independently accepted | Estimated cost | Deferred / requested |
|---|---|---|---:|---:|
| test-execution-screen-v1 / unrestricted | provider_error | false | unknown | 0/0 |
| post-reset-screen-v1 / unrestricted | completed | true | $0.05886 | 0/4 |
| post-reset-screen-v1 / fixed | completed | true | $0.04659 | 2/3 |
| post-reset-screen-v1 / selective | completed | true | $0.05194 | 0/3 |

The fresh aliased merge-source task is separate from all scored tasks and A/B/C. Screening is not an untouched holdout and the pre-reset provider failure provides no baseline difficulty evidence.

## Scored independent correctness and total inference

| Arm | Accepted | Known total cost | Unknown attempts | Executed / requested public tests | Deferred | Public test wall ms |
|---|---:|---:|---:|---:|---:|---:|
| unrestricted | 6/6 | $0.33544 | 0 | 26/26 | 0 | 22296 |
| fixed | 6/6 | $0.28013 | 0 | 6/18 | 12 | 10536 |
| selective | 6/6 | $0.28512 | 0 | 23/23 | 0 | 21403 |

Failures remain in cost totals. Independent final test time is separately recorded and mandatory in every arm. Public subprocess wall time excludes source-digest overhead; total agent wall time includes orchestration. Neither measure is CPU-cycle accounting. Local test suppression is not itself model-token savings.

## Common complete-cost groups

| Arm | Matched task/repetition groups | Mean inference cost | Accepted in common groups |
|---|---:|---:|---:|
| unrestricted | 6 | $0.05591 | 6 |
| fixed | 6 | $0.04669 | 6 |
| selective | 6 | $0.04752 | 6 |

Fixed observed mean model cost is 16.5% below unrestricted, with 12 real deferrals. Selective observed cost is 15.0% below unrestricted, but its suppression activated 0 times: this difference cannot be credited to duplicate-test suppression. All complete matched groups are included regardless of success. Unknown telemetry is retained outside this cost comparison and still counted in correctness. Small samples, public historical repairs potentially represented in training, unpaired randomness and concurrent provider/machine/cache activity prevent general causal or significance claims.

## Equal $0.75 model-cost budget view

| Arm | Attempts fitting budget | Accepted | Spent | Remaining | Unknown before next task |
|---|---:|---:|---:|---:|---|
| unrestricted | 6 | 6 | $0.39429 | $0.35571 | true |
| fixed | 6 | 6 | $0.32672 | $0.42328 | false |
| selective | 6 | 6 | $0.33706 | $0.41294 | false |

This is a frozen-order scored-task prefix after charging each arm's screening lower bound, including the preserved failed pre-reset baseline request. All failures/planning/retries are charged; it is not a new paid campaign. Unknown pre-reset charges mean unrestricted budget membership is a lower-bound view, not an exact equal-total-cost comparison. Any unspent budget does not establish greater capability, and unfinished/unknown runs prevent a complete frontier.

## Offline feedback-risk diagnostic

The preserved deterministic actual-process trace, separate from live model repair, executed 6/6 unrestricted requests (2020ms, two observed failing checks), 1/6 fixed requests (299ms, zero observed failing checks), and 3/6 selective requests (956ms, one observed failing check). Fixed suppressed a novel failing behavioral suite before the next edit checkpoint. Every arm's mandatory independent final check detected baseline failure and reference success. This establishes a feedback-loss mechanism, not model savings or live capability improvement.

## Validation and limitations

Four fresh historical js-yaml fixtures validated: original behavioral assertion failure, reference repair acceptance pass, original upstream 286/290/297/305-check pass. Scored tasks: merge sentinel leakage across tag resolution/constructor, flow alias/property-only key separation, whitespace-only scalar dedent. Source-only fixtures exclude docs/distribution; distribution-build, dependency-heavy fuzzing and pathological stress tests remain outside regression. Pre-freeze draft corrections for YAML1.1 implicit y booleans and a preexisting flowSkipColonSpace defect are documented; hidden flow checks cover default spacing.

13/13 focused harness checks pass. Inherited broad suite 86/87 has an existing retry-idempotency exact-match reference replacement failure consistent with Windows line-ending sensitivity. Archived manifests, fixture/test hashes and saved patches verified: **true**. Current older freeze bytes intentionally differ after documented post-quota orchestration amendments; archived bytes stay intact. Footprint 95.98MiB, free C: 6.64GiB. No auth values were inspected/copied; no credential/provider fallback. Engineering work is excluded from benchmark inference costs.

All scored arms accepted every task and the baseline also passed screening, so no capability increase or difficult-task rescue was measured. Every arm fits all six scored tasks within the known $0.75 budget; the budget is nonbinding and baseline membership has an unknown-charge limitation. Recommendation: retain fixed scheduling only as an efficiency experiment, not a default; its feedback risk remains despite this cohort's all-pass outcome. Selective has no live activation evidence here. Fixed checkpoints have a demonstrated feedback risk; selective revision scheduling has a narrower stale-repeat scope. No skipped test is credited as success.

Concurrency limitation: evaluated v1 admits simultaneous identical-revision requests before recording completion. Post-campaign deterministic tests reproduce both fixed/selective races. The audit of all 21 live repairs found zero overlapping test intervals, parallel test batches, duplicate selective executions, or fixed serial-gate violations; inferred intervals may miss very small overlaps. Separate serialized v2 passes 8/8 tests and is **unbenchmarked**; scored agent and archived bytes still use v1. It does not address simultaneous source mutation. See docs/TEST-EXECUTION-CONCURRENCY-V2.md. Independent post-campaign re-execution passed 18/18 workspaces; additional audit test time 90889 ms is separate verification workload, not model inference.

Runnable commands and complete protocol: docs/TEST-EXECUTION.md. Results/receipts: reports/TEST-EXECUTION-RESULTS.json, reports/test-execution-verification.json, reports/test-execution-harness-tests.txt. Refresh: node scripts/test-execution-report.mjs. Private raw transcripts, frozen runtime copies and patches remain under .suffice/test-execution-runs/.
