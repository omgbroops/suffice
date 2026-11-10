# Repository intelligence v4 actual results

6/192 model attempts executed; 7 operational launch receipts (1 stopped before any provider request, originals retained in launches.json); 6 scorable; 186 missing. 0/24 tasks have all four configurations and both repetitions. Preflight and v3 data are excluded.

## Primary paired cohort

| Configuration | Accepted | Rate | Estimated cost | Cost/accepted |
|---|---:|---:|---:|---:|
| Luna baseline | 0/0 | unavailable | $0.00000 | unavailable |
| Luna always-guided | 0/0 | unavailable | $0.00000 | unavailable |
| Luna on-demand | 0/0 | unavailable | $0.00000 | unavailable |
| Sol Medium baseline | 0/0 | unavailable | $0.00000 | unavailable |

## Complete four-arm rounds (sensitivity)

| Configuration | Accepted | Rate | Estimated cost | Cost/accepted |
|---|---:|---:|---:|---:|
| Luna baseline | 0/1 | 0.0% | $0.01768 | unavailable |
| Luna always-guided | 0/1 | 0.0% | $0.01814 | unavailable |
| Luna on-demand | 0/1 | 0.0% | $0.02529 | unavailable |
| Sol Medium baseline | 0/1 | 0.0% | $0.06159 | unavailable |

Resource-policy phases are separately tabulated in aggregate.json. The first four model attempts used the original admission floors; the user-authorized post-restart phase has lower launch floors with unchanged model, agent and test budgets. These host starting conditions are not treated as identical.

These tables have different inclusion criteria. Missing and infrastructure-affected cells are explicit in cells.json/cells.csv. Similar observed rates do not establish equivalence. Confidence intervals are exploratory task-cluster resamples, conditional on a small number of correlated repository families. No missing result is extrapolated.

## Spending

Known v4 cost including smoke preflight: $0.20296; reserved $5.45296 against $25. 0 entries have unknown usage. Prices are catalog estimates, not invoices.

## Outcome-change cases requiring mechanism review

No task has complete paired repetitions yet; mechanism comparisons remain unavailable.
