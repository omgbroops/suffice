# Repository intelligence v4 actual results

72/96 current-policy model attempts executed; 16 previously executed repeats retained separately; 88 model attempts across all collection phases; 92 operational launch receipts (4 stopped before any provider request, originals retained in launches.json); 71 scorable; 24 missing (24 blocked by environment validation). 17/24 tasks have all four configurations for the selected repetition(s): 0. Legacy repeats are excluded from primary comparisons and remain in cells.json and legacyRepetitions. The user reduced the plan from 192 to 96 on November 10; fewer repeats weaken assessment of reproducibility. All actual spending still counts against $25. Preflight and v3 data are excluded.

## Primary paired cohort

| Configuration | Accepted | Rate | Estimated cost | Cost/accepted |
|---|---:|---:|---:|---:|
| Luna baseline | 3/17 | 17.6% | $0.38700 | $0.12900 |
| Luna always-guided | 4/17 | 23.5% | unknown | unavailable |
| Luna on-demand | 4/17 | 23.5% | $0.41705 | $0.10426 |
| Sol Medium baseline | 6/17 | 35.3% | $1.18939 | $0.19823 |

## Complete four-arm rounds (sensitivity)

| Configuration | Accepted | Rate | Estimated cost | Cost/accepted |
|---|---:|---:|---:|---:|
| Luna baseline | 3/17 | 17.6% | $0.38700 | $0.12900 |
| Luna always-guided | 4/17 | 23.5% | unknown | unavailable |
| Luna on-demand | 4/17 | 23.5% | $0.41705 | $0.10426 |
| Sol Medium baseline | 6/17 | 35.3% | $1.18939 | $0.19823 |

Requested service tiers and resource-policy phases are separately tabulated in aggregate.json. Priority-requested runs retain raw response tiers and do not claim server-confirmed Fast when responses say default. These catalog models use regular openai-responses; its costs follow the raw reported tier. The earlier Codex-only fallback interpretation is superseded by priority-provider-correction.json. No Fast speedup is inferred from request acceptance. Graph refresh durations are serialized within each intelligence instance and summed as measured activity; they may overlap other asynchronous work and are not an exclusive attribution of end-to-end wall time. Heap deltas and serialized graph bytes are not process peak RSS; sampled RSS is reported separately.

The first four model attempts used the original admission floors; the user-authorized post-restart phase has lower launch floors with unchanged model, agent and test budgets. These host starting conditions are not treated as identical.

These tables have different inclusion criteria. Missing and infrastructure-affected cells are explicit in cells.json/cells.csv. Similar observed rates do not establish equivalence. Confidence intervals are exploratory task-cluster resamples, conditional on a small number of correlated repository families. No missing result is extrapolated.

## Spending

Known v4 cost including smoke preflight: $3.14960; reserved $4.08520 against $25. 2 entries retain unresolved cost reservations (including any pending accounting reconciliation). Prices are catalog estimates, not invoices.

## Outcome-change cases requiring mechanism review

- B minus A: serverless__serverless-5640, mean difference 1, discordant repetitions 1/1. Review raw graph evidence and subsequent consequential actions; path overlap alone does not demonstrate causation.
- C minus A: prettier__prettier-8381, mean difference 1, discordant repetitions 1/1. Review raw graph evidence and subsequent consequential actions; path overlap alone does not demonstrate causation.
- C minus B: prettier__prettier-8381, mean difference 1, discordant repetitions 1/1. Review raw graph evidence and subsequent consequential actions; path overlap alone does not demonstrate causation.
- C minus B: serverless__serverless-5640, mean difference -1, discordant repetitions 1/1. Review raw graph evidence and subsequent consequential actions; path overlap alone does not demonstrate causation.
- C minus D: prettier__prettier-12584, mean difference -1, discordant repetitions 1/1. Review raw graph evidence and subsequent consequential actions; path overlap alone does not demonstrate causation.
- C minus D: mrdoob__three.js-23796, mean difference -1, discordant repetitions 1/1. Review raw graph evidence and subsequent consequential actions; path overlap alone does not demonstrate causation.
