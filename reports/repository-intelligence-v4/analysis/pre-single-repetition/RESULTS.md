# Repository intelligence v4 actual results

36/192 model attempts executed; 38 operational launch receipts (2 stopped before any provider request, originals retained in launches.json); 36 scorable; 156 missing. 4/24 tasks have all four configurations and both repetitions. Preflight and v3 data are excluded.

## Primary paired cohort

| Configuration | Accepted | Rate | Estimated cost | Cost/accepted |
|---|---:|---:|---:|---:|
| Luna baseline | 0/8 | 0.0% | $0.19640 | unavailable |
| Luna always-guided | 0/8 | 0.0% | unknown | unavailable |
| Luna on-demand | 1/8 | 12.5% | $0.20499 | $0.20499 |
| Sol Medium baseline | 6/8 | 75.0% | $0.57907 | $0.09651 |

## Complete four-arm rounds (sensitivity)

| Configuration | Accepted | Rate | Estimated cost | Cost/accepted |
|---|---:|---:|---:|---:|
| Luna baseline | 0/9 | 0.0% | $0.21067 | unavailable |
| Luna always-guided | 0/9 | 0.0% | unknown | unavailable |
| Luna on-demand | 1/9 | 11.1% | $0.22243 | $0.22243 |
| Sol Medium baseline | 6/9 | 66.7% | $0.64089 | $0.10682 |

Requested service tiers and resource-policy phases are separately tabulated in aggregate.json. Priority-requested runs retain raw response tiers and do not claim server-confirmed Fast when responses say default. These catalog models use regular openai-responses; its costs follow the raw reported tier. The earlier Codex-only fallback interpretation is superseded by priority-provider-correction.json. No Fast speedup is inferred from request acceptance. Graph refresh durations are serialized within each intelligence instance and summed as measured activity; they may overlap other asynchronous work and are not an exclusive attribution of end-to-end wall time. Heap deltas and serialized graph bytes are not process peak RSS; sampled RSS is reported separately.

The first four model attempts used the original admission floors; the user-authorized post-restart phase has lower launch floors with unchanged model, agent and test budgets. These host starting conditions are not treated as identical.

These tables have different inclusion criteria. Missing and infrastructure-affected cells are explicit in cells.json/cells.csv. Similar observed rates do not establish equivalence. Confidence intervals are exploratory task-cluster resamples, conditional on a small number of correlated repository families. No missing result is extrapolated.

## Spending

Known v4 cost including smoke preflight: $1.34535; reserved $1.80063 against $25. 1 entries retain unresolved cost reservations (including any pending accounting reconciliation). Prices are catalog estimates, not invoices.

## Outcome-change cases requiring mechanism review

- C minus A: prettier__prettier-8381, mean difference 0.5, discordant repetitions 1/2. Review raw graph evidence and subsequent consequential actions; path overlap alone does not demonstrate causation.
- C minus B: prettier__prettier-8381, mean difference 0.5, discordant repetitions 1/2. Review raw graph evidence and subsequent consequential actions; path overlap alone does not demonstrate causation.
- C minus D: prettier__prettier-12584, mean difference -1, discordant repetitions 2/2. Review raw graph evidence and subsequent consequential actions; path overlap alone does not demonstrate causation.
- C minus D: prettier__prettier-8381, mean difference -0.5, discordant repetitions 1/2. Review raw graph evidence and subsequent consequential actions; path overlap alone does not demonstrate causation.
- C minus D: mrdoob__three.js-23796, mean difference -1, discordant repetitions 2/2. Review raw graph evidence and subsequent consequential actions; path overlap alone does not demonstrate causation.
