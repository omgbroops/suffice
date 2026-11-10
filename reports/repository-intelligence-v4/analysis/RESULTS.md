# Repository intelligence v4 actual results

19/192 model attempts executed; 20 operational launch receipts (1 stopped before any provider request, originals retained in launches.json); 19 scorable; 173 missing. 2/24 tasks have all four configurations and both repetitions. Preflight and v3 data are excluded.

## Primary paired cohort

| Configuration | Accepted | Rate | Estimated cost | Cost/accepted |
|---|---:|---:|---:|---:|
| Luna baseline | 0/4 | 0.0% | $0.05684 | unavailable |
| Luna always-guided | 0/4 | 0.0% | $0.07157 | unavailable |
| Luna on-demand | 0/4 | 0.0% | $0.07681 | unavailable |
| Sol Medium baseline | 2/4 | 50.0% | $0.24503 | $0.12251 |

## Complete four-arm rounds (sensitivity)

| Configuration | Accepted | Rate | Estimated cost | Cost/accepted |
|---|---:|---:|---:|---:|
| Luna baseline | 0/4 | 0.0% | $0.05684 | unavailable |
| Luna always-guided | 0/4 | 0.0% | $0.07157 | unavailable |
| Luna on-demand | 0/4 | 0.0% | $0.07681 | unavailable |
| Sol Medium baseline | 2/4 | 50.0% | $0.24503 | $0.12251 |

Requested service tiers and resource-policy phases are separately tabulated in aggregate.json. Priority-requested runs retain raw response tiers and do not claim server-confirmed Fast when responses say default. These catalog models use regular openai-responses; its costs follow the raw reported tier. The earlier Codex-only fallback interpretation is superseded by priority-provider-correction.json. No Fast speedup is inferred from request acceptance. Graph refresh durations are serialized within each intelligence instance and summed as measured activity; they may overlap other asynchronous work and are not an exclusive attribution of end-to-end wall time. Heap deltas and serialized graph bytes are not process peak RSS; sampled RSS is reported separately.

The first four model attempts used the original admission floors; the user-authorized post-restart phase has lower launch floors with unchanged model, agent and test budgets. These host starting conditions are not treated as identical.

These tables have different inclusion criteria. Missing and infrastructure-affected cells are explicit in cells.json/cells.csv. Similar observed rates do not establish equivalence. Confidence intervals are exploratory task-cluster resamples, conditional on a small number of correlated repository families. No missing result is extrapolated.

## Spending

Known v4 cost including smoke preflight: $0.67541; reserved $1.57190 against $25. 2 entries retain unresolved cost reservations (including any pending accounting reconciliation). Prices are catalog estimates, not invoices.

## Outcome-change cases requiring mechanism review

- C minus D: mrdoob__three.js-23796, mean difference -1, discordant repetitions 2/2. Review raw graph evidence and subsequent consequential actions; path overlap alone does not demonstrate causation.
