# V10 versus native Codex: 15-task comparison

**V10 passed 12/15; native Codex passed 14/15.** V10 cost about 87% less in recorded base-rate estimates, but took about 31% longer per attempt. This run supports a cost/quality tradeoff; it does not show an accuracy advantage for v10.

| Metric | Suffice v10 | Native Codex |
| --- | ---: | ---: |
| Independently accepted source | 12/15 (80%) | 14/15 (93.3%) |
| Accepted within operational and protection controls | 11/15 | 13/15 |
| Actor reported completion | 13/15 | 15/15 |
| Final original public regressions passed | 15/15 | 15/15 |
| Total estimated model cost | $0.16023638 | $1.22052080 |
| Estimated cost per accepted source | $0.01335 | $0.08718 |
| Mean actor time | 88.0 s | 66.9 s |
| Mean time including final verification/sealing | 89.7 s | 68.6 s |
| Repairs / expert takeovers | 0 / 0 | — |
| Deadline timeouts / unknown benchmark costs | 0 / 0 | 0 / 0 |

All **30 scheduled attempts** finished and all 15 task pairs were scored. Paired outcomes: 12 both pass, two native-only passes, one both fail, zero v10-only passes. Total scheduled model usage estimate: **$1.38075718**. Execution ran on October 23, 2026, from 21:03 to 21:23 UTC; grading followed after closure. Native was about 7.62 times as expensive under the pinned rates.

## Task results

These are source-quality verdicts from unchanged independent acceptance and original public suites. Operational/protection exceptions are shown separately below.

| Task | Repository | V10 | Native |
| --- | --- | --- | --- |
| dotted-prerelease | node-semver | Pass | Pass |
| picomatch-142 | picomatch | Pass | Pass |
| picomatch-99 | picomatch | Fail | Pass |
| picomatch-187 | picomatch | Fail | Fail |
| picomatch-202 | picomatch | Pass | Pass |
| bytes-51 | bytes | Pass | Pass |
| cookie-173 | cookie | Pass | Pass |
| path-to-regexp-425 | path-to-regexp | Pass | Pass |
| numeric-xrange | node-semver | Pass | Pass |
| caret-prerelease | node-semver | Pass | Pass |
| prerelease-diff | node-semver | Fail | Pass |
| numeric-prerelease | node-semver | Pass | Pass |
| mapping-boundaries | js-yaml | Pass | Pass |
| folded-tabs | js-yaml | Pass* | Pass* |
| exponent-integers | js-yaml | Pass | Pass |

V10's picomatch-99 worker exhausted its existing 24-request implementation limit, leaving a partial source result. The saved source still matched `somepath/test.thing.js` against `**.thing.js`, which should treat the adjacent globstar as a single star. This was an operational failure, not a monetary cutoff; no writer, repair or takeover followed it.

For prerelease-diff, v10 fixed the main changed-core cases but classified `2.0.0-1 → 2.1.1` as `minor` instead of preserving the required initial-major stabilization result `major`. Both agents missed picomatch-187's lone `[!]` compatibility case; v10 also broke the `literalBrackets`/`nobracket` option checks. All three v10 failures still passed the supplied public regressions. Its generated checks did not uncover the two completed-but-incorrect fixes, so no expert repair or takeover was triggered.

*For folded-tabs, v10 produced accepted source but returned `unverified`: its generated test called `eventsToAst` without the necessary context, and its arbiter could not distinguish test misuse from a production defect using the supplied excerpt. Native's source also passed, but it appended regression cases to the protected public test file. Existing tests were retained; this was an additive test edit. The wrapper recorded the violation and restored the original suite before final checking/sealing. Each arm therefore loses one otherwise accepted result under the stricter completion/control metric. No intent to weaken tests is inferred.

## What was compared

The unchanged v10 controller used Pi with `gpt-6-luna` high for implementation, `gpt-6.1-sol` low for tool-free public-spec test generation/arbitration, and Sol high available for selective takeover. AST navigation was available in every attempt and used for symbol navigation in 12/15: the logs contain 21 `symbols` and 26 `symbol_read` observations in total. Pi codemode remained enabled; compact responses were disabled. There were no expert repairs/takeovers, and only folded-tabs reached arbitration.

Native used the desktop-bundled `codex-cli 0.162.0-alpha.17.2`, `gpt-6.1-sol` high, its own system instructions, shell/apply_patch and required Code Mode host. This was a controlled single-agent CLI profile: delegation, unrelated plugins/MCP, memories, hooks and web/browser features were disabled; user config/rules and automatic project documents were ignored. Shell network access remained available in both arms. This compares agents with different routing and internal limits, not equal model compute or every desktop Codex feature.

Each arm received identical public prompts, full upstream source and original regression suites in a fresh temporary Git root. Both had full host access and a 600-second deadline. There was no practical dollar cutoff. V10 kept its existing per-stage turn/tool/context limits; native kept its own loop. A seeded schedule interleaved two concurrent lanes, with one repetition per task and arm.

The cohort comprises **15 known historical JS/TS development replays across six repositories**, none from the earlier four-task pilot. They are small repair tasks already studied in this repository, with possible model familiarity and only one paired sample. Repository/task clustering and lack of repetitions limit generalization. These results do not establish broad software-engineering reliability or a leaderboard position.

## Grading and accounting

Independent acceptance suites and reference procedures were frozen before any actor ran; their SHA256 digest was bound into both execution-started and execution-complete. Graders and fixed references loaded/ran only after all 30 coding attempts were terminal. Every broken original was rejected, every fixed reference passed, and both original/reference public regressions passed. There are 39 named independent acceptance tests per arm and 70 original public tests across the cohort; individual named tests may contain several assertions.

Private verdicts never entered either controller, caused retries or funded repairs. V10's generated tests came from the public contract. Fresh copies of sealed actor snapshots were scored, including failed/unverified actors. Original tests, fixtures, docs and metadata were restored before sealing; violations were retained. Full host access is not an OS secrecy boundary, so this is procedural separation rather than a hardened private-evaluator sandbox.

One baseline-validation heuristic was corrected after execution: cookie-173's intended source failure threw a `TypeError` before the assertion executed, while the frozen driver required literal `ERR_ASSERTION`. A fresh blind reviewer confirmed this using only the public contract, frozen test and baseline/reference evidence. A separate supplemental script then scored just the two previously ungraded cookie snapshots. **No actor reran, no acceptance assertion changed, and no previously scored result changed.** The reviewed baseline-validation rule was expanded after execution; this part of scoring was not wholly prespecified. Initial grades remain preserved; use `grades.final.json` and `summary.final.json` for the final 15-task results. See the [review](v10-native15-20261023/supplemental-blind-review.md), [decision](v10-native15-20261023/supplemental-decision.json) and [completion receipt](v10-native15-20261023/supplemental-completed.json).

Both arms use the same rates frozen from the Pi model catalog: Luna input/output/cache-read/cache-write $0.10/$0.50/$0.01/$0.125 per million tokens; Sol $2/$10/$0.10/$2.50. Raw token receipts are retained. These are API-equivalent base-rate estimates, not subscription charges or an invoice. Native aggregate usage cannot prove per-request long-context tier pricing; requested models are pinned and model availability/canaries verified, while native per-response backend identity is not independently attested. All scheduled costs reconciled with the raw receipts, with no unknown benchmark rows. Setup canaries are excluded: their known estimate floor is $0.0424588, with one additional failed canary retaining unknown cost.

## Verification and evidence

Before execution, 52 targeted tests passed: 31 existing v10 tests, 15 native-adapter tests and six paired-runner tests. The supplemental classifier's two additional tests passed, including rejection of incomplete suites, changed logs, timeouts and arbitrary execution failures. All 15 original public suites passed during fixture preparation. Final receipt audit verified all 30 workspace/snapshot hashes, frozen runtime/evaluators, token/cost reconciliation and tool-free reviewer calls without discrepancies. A separate final read-only review confirmed the correction changed only the two previously ungraded cookie rows and independently recomputed the final scores.

The frozen runtime hash is `6b455de67ac0a700986e3f75bbe880c605e987a071c5fa861805c375c9c9d64c`. Prepared source is committed as `87571b1`; it was not retuned using these outcomes. The supplemental scoring helper is separate from that frozen runtime. The [protocol](../docs/V10-NATIVE-BENCHMARK.md) describes replay and limitations.

Machine-readable [final summary](v10-native15-20261023/summary.final.json), [final grades](v10-native15-20261023/grades.final.json), [reference validation](v10-native15-20261023/reference-validation.final.json), [execution closure](v10-native15-20261023/execution-complete.json), [audit](v10-native15-20261023/audit.json), [plan](v10-native15-20261023/plan.json), [pricing](v10-native15-20261023/pricing.json) and [grader freeze](v10-native15-20261023/grading-freeze.json) accompany the report.

Reproducible artifacts: [runtime](v10-native15-20261023/runtime.zip), [original inputs](v10-native15-20261023/public-inputs.zip), [preparation/setup canaries](v10-native15-20261023/preflight-and-preparation.zip), and [all results](v10-native15-20261023/results-evidence.zip). The results archive contains raw actor logs/receipts, both raw and sealed source trees, frozen tests, baseline/reference/actor grading outputs, reference deltas, and supplemental scoring evidence. Its [file inventory](v10-native15-20261023/evidence-files.json) and [archive receipt](v10-native15-20261023/archive.json) support byte-for-byte verification. Original pre-correction grades and summary are retained alongside the authoritative final files.
