# Repository intelligence v4 actual results

14/192 model attempts executed; 15 operational launch receipts (1 stopped before any provider request, originals retained in launches.json); 14 scorable; 178 missing. 1/24 tasks have all four configurations and both repetitions. Preflight and v3 data are excluded.

## Primary paired cohort

| Configuration | Accepted | Rate | Estimated cost | Cost/accepted |
|---|---:|---:|---:|---:|
| Luna baseline | 0/2 | 0.0% | $0.02975 | unavailable |
| Luna always-guided | 0/2 | 0.0% | $0.03283 | unavailable |
| Luna on-demand | 0/2 | 0.0% | $0.04434 | unavailable |
| Sol Medium baseline | 0/2 | 0.0% | $0.12691 | unavailable |

## Complete four-arm rounds (sensitivity)

| Configuration | Accepted | Rate | Estimated cost | Cost/accepted |
|---|---:|---:|---:|---:|
| Luna baseline | 0/3 | 0.0% | $0.04539 | unavailable |
| Luna always-guided | 0/3 | 0.0% | $0.05131 | unavailable |
| Luna on-demand | 0/3 | 0.0% | $0.05553 | unavailable |
| Sol Medium baseline | 1/3 | 33.3% | $0.19752 | $0.19752 |

Requested service tiers and resource-policy phases are separately tabulated in aggregate.json. Priority-requested runs retain raw response tiers and do not claim server-confirmed Fast when responses say default. The installed SDK uses requested-Priority pricing for its documented Codex fallback.

The first four model attempts used the original admission floors; the user-authorized post-restart phase has lower launch floors with unchanged model, agent and test budgets. These host starting conditions are not treated as identical.

These tables have different inclusion criteria. Missing and infrastructure-affected cells are explicit in cells.json/cells.csv. Similar observed rates do not establish equivalence. Confidence intervals are exploratory task-cluster resamples, conditional on a small number of correlated repository families. No missing result is extrapolated.

## Spending

Known v4 cost including smoke preflight: $0.45873; reserved $1.35523 against $25. 2 entries have unknown usage. Prices are catalog estimates, not invoices.

## Outcome-change cases requiring mechanism review

No observed repetition-level discordances in the complete primary cohort. This does not establish equivalence.
