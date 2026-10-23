# Suffice v10 Pi pilot results

**V10 passed all four independent task graders at $0.03515 API-equivalent cost.** Luna alone and the minimal ladder also passed all four for less. This small development pilot establishes working Pi integration and records costs; it does not establish an accuracy advantage for v10 or general software-engineering ability.

The run uses Pi 1.2.0, `gpt-6-luna` and `gpt-6.1-sol`, with Suffice's AST navigation and codemode. Every arm has the same tools, public checks and high worker/expert effort. V10 additionally uses a tool-free Sol test writer at low effort. Compact output is off throughout. The frozen implementation is commit `92d19ee` on `codex/suffice-v10`.

## Original comparison

Four tasks × four strategies, one repetition, seeded order. Two tasks are authored exercises (async retry and streaming JSON-lines). Two replay historical npm/node-semver bugs (prerelease subset and long build metadata) at `efa4be6096c1f9b77d9d27d6132f6220c43b4e31`. These are previously studied development tasks, not an unseen efficacy cohort.

| Strategy | Independent artifact passes | Valid completions | API-equivalent cost | Cost / artifact pass | Mean time |
| --- | ---: | ---: | ---: | ---: | ---: |
| Luna alone | 4/4 | 4/4 | $0.01559 | $0.00390 | 83.2 s |
| Sol alone | 4/4 | 3/4 | $0.24242 | $0.06061 | 79.3 s |
| Luna → Sol ladder | 4/4 | 4/4 | $0.01466 | $0.00367 | 85.7 s |
| V10 | 4/4 | 4/4 | $0.03515 | $0.00879 | 95.7 s |

All 16 source snapshots passed their independent task grader. Fifteen runs completed public verification. Sol's original build-metadata run stopped before its next model request because a conservative reservation would exceed its remaining $0.50 allowance. It had actually spent $0.10096. Its saved partial implementation passed independent grading afterward, but the stopped run remains ineligible as a valid completion. Its cost remains included. Sol's cost per valid completion is $0.08081.

V10's four generated suites passed without repair or arbitration. **No live repair or Sol takeover occurred in any arm.** The ladder consequently behaved like Luna alone; the small cost difference is variation between independent runs. V10 cost about 2.25 times Luna alone on this cohort, with the same acceptance. There is no measured benefit from escalation here, and this is not an AST ablation because every arm received navigation.

## Requested uncapped restart

Before independent grading, the user requested restarting Sol's build-metadata task from original source and removing its dollar cap. This used a separate fresh workspace and receipt directory. The original comparison was retained unchanged. The restart has no practical monetary ceiling (`Number.MAX_VALUE` is the existing runner's numeric sentinel); its original 300-second deadline and tool/context limits remain.

The restart completed in 151.2 seconds and passed public checks at **$0.11482**, then passed **65/67** independent assertions. It failed both strict-short and loose-long metadata cases for partial hyphen ranges such as `4.17+build.7 - 5+build.7`. Independent acceptance is therefore **failed**. This result is neither substituted for the original Sol row nor retried using private diagnostics.

Total recorded v10 usage, including the stopped attempt and uncapped restart: **$0.42264782**. Original 16-run campaign: $0.30782782. All v10 costs are known and reconcile to raw Pi usage. These are API-equivalent estimates, not subscription invoices. The older rejected v9 CLI request still has unknown cost and is excluded from that total.

## Independent grading

All actors closed by `2026-10-23T20:29:25.567Z`. Only afterward did two fresh subagents, without inherited solution context, author graders from the public contracts and original/reference behavior. They were instructed not to inspect actor code, prose, receipts or status. The graders contain explicit expected values; they do not import actor-generated tests as an oracle.

| Task | Named independent checks | Broken baseline failures | Reference failures |
| --- | ---: | ---: | ---: |
| Retry | 18 | 13 | 0 |
| JSON-lines | 14 | 9 | 0 |
| Build metadata | 67 | 36 | 0 |
| Prerelease subset | 73 | 21 | 0 |

References for the authored tasks were implemented independently from the contract. The semver references change exactly `classes/range.js` at upstream fix `17aa702d91166472b197a2ea768f085083bee2e4`, or `ranges/subset.js` at `5f3ca133e040210b6ea80c350a1d61d9da02e722`. Fetch URLs, hashes, assertion rationales and baseline/reference validation logs are preserved. Grader hashes were frozen before any actor was scored and checked again afterward. Scoring ran from `20:38:34.832Z` to `20:38:43.354Z`.

The evaluator copied each sealed snapshot into a fresh grading directory after checking both its saved hash and the actor workspace hash. **No hidden verdict entered the coding controller, funded an escalation, or caused a subsequent actor run.** This is deferred local evaluation, not OS-enforced secrecy or a preregistered held-out study. A larger unseen cohort with evaluator isolation and repetitions is still needed.

## Runtime and validation evidence

All 17 frozen runtime files match the prepared hash. Across the original campaign, observed navigation calls were `symbols` 18, `symbol_read` 26 and `symbol_references` 6; the restart added 6, 9 and 1 respectively. AST tools were actually used, although several individual attempts used ordinary file/command tools instead. There were no compacted responses or observation-recovery calls. The four independent test-writer stages returned zero tool calls. All 190 model responses reconcile with stage and campaign accounting.

- 31 v10 offline tests passed, including actual Pi/codemode execution with a fake provider and refusal of an SDK continuation before another paid dispatch.
- 59 combined v9/v10 tests passed.
- Full suite: 304 tests, 248 passed, 49 failed, 7 skipped. Failure names match the untouched `28b40b6` Windows baseline (245 tests, 189 passed, 49 failed, 7 skipped). Existing failures include `/bin/sh`, symlink privileges and an old developer's fixture path.

The initial comparison retained $0.50 and 300 seconds per attempt, with a $9 campaign allowance. The earlier $1 reserve against unknown v9 usage was an accounting reserve, not a measured charge. The user's later removal of the dollar cap applies to the separately recorded restart. Request reservations are conservative accounting controls based on pinned pricing/token assumptions, not provider billing enforcement.

## Saved artifacts

[Summary](v10-pi-pilot-20261023/summary.json), [execution](v10-pi-pilot-20261023/execution-complete.json), [grades](v10-pi-pilot-20261023/grades.json), [uncapped restart](v10-pi-pilot-20261023/sol-uncapped-restart/execution-complete.json), [audit](v10-pi-pilot-20261023/audit.json), [grading boundary](v10-pi-pilot-20261023/evaluation/frozen.json), [development grader](v10-pi-pilot-20261023/evaluation/development/manifest.json) and [semver grader](v10-pi-pilot-20261023/evaluation/semver/manifest.json) retain the individual outcomes and validation.

[Evidence archive](v10-pi-pilot-20261023/evidence.zip) contains original inputs, selected source snapshots, raw stage events/observations, receipts, graders and reference-validation artifacts, excluding Git internals and authentication. Its extracted files are checked against the [inventory](v10-pi-pilot-20261023/evidence-files.json); the [archive receipt](v10-pi-pilot-20261023/archive.json) records its hash. The [exact frozen runtime](v10-pi-pilot-20261023/runtime.zip), [runtime hashes](v10-pi-pilot-20261023/runtime-files.json), [plan](v10-pi-pilot-20261023/plan.json) and [authenticated preflight](v10-pi-pilot-20261023/preflight.json) remain available. Paths in receipts identify the original local checkout; rebase them when replaying elsewhere. See [v10 usage](../docs/V10.md).
