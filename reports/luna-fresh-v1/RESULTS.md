# Fresh Luna Extra High: baseline and single public regression gate

**Timing instability:** f01/B has identical library bytes before/after repair and identical bytes to A. Those bytes independently passed once and failed later because a 300 ms lower-bound test measured 299.99/299.90 ms. The gate also triggered on 299.92 ms, costing $0.00274778 for four extra model replies without a code change. This is not a demonstrated behavioral rescue or a confirmed coding failure. See timing-instability.json and gate-activation-audit.json.

**Grading limitation:** f06/fastq88 has a disputed extra scheduling constraint. The A patch reproduces the original issue’s expected printed order in 10/10 checks but fails an added Promise.all observation boundary. Keep the frozen raw scores below; do not credit the A/B score difference on f06 to the safeguard or call it a confirmed Luna coding failure. See drain-contract-audit.json.

Completed 12/12 attempts; 0 incomplete/still running. Known completed plus partial benchmark inference: $0.11579042 API-equivalent; engineering inference and subscription cash spending excluded. Incomplete attempts are retained in the JSON ledger; summary rows below concern finalized attempts only.

| Arm | Accepted | Eligible successes | Cost | Cost / success | Turns | Mean actor seconds | Repair activations |
|---|---:|---:|---:|---:|---:|---:|---:|
| A plain xhigh | 5/6 | 5 | $0.055421 | $0.011084 | 86 | 188.2 | 0 |
| B xhigh + public gate | 5/6 | 5 | $0.060369 | $0.012074 | 88 | 236.4 | 1 |

| Issue | A | B | A cost | B cost |
|---|---|---|---:|---:|
| [sindresorhus/p-map#94](https://github.com/sindresorhus/p-map/issues/94) | pass | fail | $0.007054 | $0.011036 |
| [sindresorhus/p-map#76](https://github.com/sindresorhus/p-map/issues/76) | pass | pass | $0.007267 | $0.004982 |
| [sindresorhus/p-map#95](https://github.com/sindresorhus/p-map/issues/95) | pass | pass | $0.019701 | $0.020674 |
| [sindresorhus/p-timeout#43](https://github.com/sindresorhus/p-timeout/issues/43) | pass | pass | $0.006080 | $0.005361 |
| [sindresorhus/p-retry#97](https://github.com/sindresorhus/p-retry/issues/97) | pass | pass | $0.008904 | $0.012992 |
| [mcollina/fastq#88](https://github.com/mcollina/fastq/issues/88) | fail | pass | $0.006414 | $0.005323 |

The following sensitivity excludes the **same disputed task from both arms**, retaining its costs explicitly in the full campaign total above. This is five tasks from three repositories, including three p-map snapshots, and is not a replacement adjusted six-task score.

| Validated contract cohort | Accepted | Inference cost | Cost / accepted | Disputed task cost (still incurred) |
|---|---:|---:|---:|---:|
| A | 5/5 | $0.049007 | $0.009801 | $0.006414 |
| B | 4/5 | $0.055046 | $0.013761 | $0.005323 |

The five-task table still contains the unstable f01 timing label. Excluding **both f01 and f06 symmetrically** yields the following four-pair sensitivity. All affected attempts and their costs remain preserved in the full campaign total. These exclusions reflect documented evaluation defects, not hidden unsuccessful coding attempts.

| Four unaffected pairs | Accepted | Inference cost | Cost / accepted | Affected-task cost still incurred |
|---|---:|---:|---:|---:|
| A | 4/4 | $0.041953 | $0.010488 | $0.013468 |
| B | 4/4 | $0.044010 | $0.011002 | $0.016359 |

Six fresh issues span four repositories, with three p-map snapshots. Some original reports include solution hints. This exploratory cohort is narrow and cannot establish universal performance or parity with Sol/Astra. All A attempts precede B, with B task order reversed; arm/time/cache differences remain uncontrolled. Both arms have the same $0.15 total per-task allowance, including repairs.

Contracts: upstream issue reports and upstream regression tests are independent of the coding actor. Parent reviewed mappings; no separate human/model reviewer was used. Buggy-source/reference controls were required before any actor. Exact implementation-specific mapper counts and an unrelated undefined-drain assertion were excluded before runs.

The B treatment supplies no new initial instructions. Code restores original public tests and runs the declared native commands at submission. On failure, it permits one same-session repair using only public diagnostics. Hidden acceptance is never model feedback. Changes to actor tests do not weaken grading.

Public-only handoff signal on fresh A: {"rows": [{"task": "f01", "signal": false, "accepted": true, "budgetEligible": true, "cost": 0.0070538, "publicCheckSeconds": 22.759}, {"task": "f02", "signal": false, "accepted": true, "budgetEligible": true, "cost": 0.007267260000000001, "publicCheckSeconds": 21.647}, {"task": "f03", "signal": false, "accepted": true, "budgetEligible": true, "cost": 0.01970096, "publicCheckSeconds": 25.753}, {"task": "f04", "signal": false, "accepted": true, "budgetEligible": true, "cost": 0.006080479999999999, "publicCheckSeconds": 3.536}, {"task": "f05", "signal": false, "accepted": true, "budgetEligible": true, "cost": 0.008904220000000001, "publicCheckSeconds": 30.583}, {"task": "f06", "signal": false, "accepted": false, "budgetEligible": true, "cost": 0.00641446, "publicCheckSeconds": 1.122}], "confusionAgainstFrozenGrader": {"truePositive": 0, "falsePositive": 0, "falseNegative": 1, "trueNegative": 5}, "validatedContractOnlyConfusion": {"truePositive": 0, "falsePositive": 0, "falseNegative": 0, "trueNegative": 5}, "limitation": "The sole frozen-grader negative is disputed f06. Zero confirmed failures on the five contract-valid cases; sensitivity to real failures is unmeasured, not 100%."}. Development-only prior xhigh: {"truePositive": 1, "falsePositive": 0, "falseNegative": 2, "trueNegative": 7}. Prior counts use frozen acceptance; the prior known posthoc s01 regression is a further missed failure.

Integrity: {"allUsageMatched": true, "responses": 174, "frozenSourceInputsMatched": true, "taskAndDependencyFreezeMatched": true}.
