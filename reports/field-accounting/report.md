# Provisional independent field accounting

Snapshot: 2026-10-15T07:43:33.704022+00:00. No final efficacy verdict.

API-equivalent estimates from startup-observed model metadata. Inference used subscription access; these are not subscription invoice charges, incremental cash spend, or measured energy costs.

All observed attempts: 30; known API-equivalent estimate $1.828268; unknown-total attempts 2.
Valid paired historical tasks currently present: i01, i02, i03, i04, q01, q02, q04, s01, s02, s03. V1 environment-invalid attempts remain in inclusive spend and are not coding failures.

## Current valid historical pairs

| Arm | Attempts | Accepted patches | Budget-certified accepted | Request intents | Failed replies recovered | Known API-equivalent | Complete total |
| --- | --- | --- | --- | --- | --- | --- | --- |
| suffice | 10 | 10 | 10 | 76 | 0 | $0.540464 | $0.540464 |
| stock-pi | 10 | 9 | 7 | 142 | 2 | $0.681877 | unknown |

Accepted means the recorded independent behavioral grade, not a budget certificate. Unknown failed-response usage is never treated as a known zero charge. Request intents include failed/retried requests; observed token totals are incomplete where raw usage is missing. Live outcomes are local acceptance only, not upstream acceptance.

## All attempt records

| Attempt | Operational classification | Scoring eligible | Recorded accepted | Known API-equivalent | Requests/replies/raw |
| --- | --- | --- | --- | --- | --- |
| v1/i01-stock-pi | invalid-environment-dependency-container-link | False | False | $0.068245 | 17/17/17 |
| v1/i01-suffice | invalid-environment-dependency-container-link | False | False | $0.084139 | 11/11/11 |
| v1/i02-stock-pi | invalid-environment-dependency-container-link | False | False | $0.085096 | 21/21/21 |
| v1/i02-suffice | invalid-environment-dependency-container-link | False | False | $0.097617 | 13/13/13 |
| v1/i04-stock-pi | invalid-environment-dependency-container-link | False | False | $0.075708 | 17/17/17 |
| v1/i04-suffice | invalid-environment-dependency-container-link | False | False | $0.048485 | 9/9/9 |
| v1/q01-stock-pi | no-established-operational-error | True | True | $0.053950 | 12/12/12 |
| v1/q01-suffice | no-established-operational-error | True | True | $0.060657 | 10/10/10 |
| v1/q02-stock-pi | no-established-operational-error | True | False | $0.092451 | 19/19/19 |
| v1/q02-suffice | no-established-operational-error | True | True | $0.065153 | 9/9/9 |
| v1/s01-stock-pi | pre-inference-preparation-partial | False | None | $0.000000 | 0/0/0 |
| v1/s02-stock-pi | no-established-operational-error | True | True | $0.095609 | 17/17/17 |
| v1/s02-suffice | no-established-operational-error | True | True | $0.045362 | 8/8/8 |
| v1/s03-stock-pi | no-established-operational-error | True | True | $0.053413 | 12/12/12 |
| v1/s03-suffice | no-established-operational-error | True | True | $0.064351 | 6/6/6 |
| v2/i01-stock-pi | no-established-operational-error | True | True | $0.057096 | 12/12/12 |
| v2/i01-suffice | no-established-operational-error | True | True | $0.052239 | 6/6/6 |
| v2/i02-stock-pi | no-established-operational-error | True | True | $0.055807 | 11/11/11 |
| v2/i02-suffice | no-established-operational-error | True | True | $0.069176 | 9/9/9 |
| v2/i03-stock-pi | no-established-operational-error | True | True | $0.068064 | 14/14/14 |
| v2/i03-suffice | no-established-operational-error | True | True | $0.046146 | 6/6/6 |
| v2/i04-stock-pi | no-established-operational-error | True | True | $0.066202 | 15/15/14 |
| v2/i04-suffice | no-established-operational-error | True | True | $0.035008 | 5/5/5 |
| v2/l01-suffice | no-established-operational-error | True | True | $0.042186 | 5/5/5 |
| v2/l02-suffice | no-established-operational-error | True | True | $0.043638 | 6/6/6 |
| v2/l03-suffice | no-established-operational-error | True | True | $0.060813 | 7/7/7 |
| v2/q04-stock-pi | no-established-operational-error | True | True | $0.058121 | 14/14/14 |
| v2/q04-suffice | no-established-operational-error | True | True | $0.059553 | 10/10/10 |
| v2/s01-stock-pi | no-established-operational-error | True | True | $0.081164 | 16/16/15 |
| v2/s01-suffice | no-established-operational-error | True | True | $0.042819 | 7/7/7 |

## Cost components and evidence

| Scope | Input | Cache read | Cache write | Output | Known total |
| --- | --- | --- | --- | --- | --- |
| all attempts | $1.166780 | $0.189478 | $0.000000 | $0.472010 | $1.828268 |
| scoring eligible | $0.868472 | $0.140416 | $0.000000 | $0.360090 | $1.368978 |
| suffice | $0.598754 | $0.080307 | $0.000000 | $0.238280 | $0.917341 |
| stock-pi | $0.568026 | $0.109171 | $0.000000 | $0.233730 | $0.910927 |

Raw usage is deduplicated by response ID and priced independently. Assistant and raw estimates for the same response are never added together. Per-response token/component/model/effort/tool checks, failed response events, HTTP observations, partial records, effective limits and source hashes are in normalized.json.

Accuracy/environment validity is separate from complete cost and budget verification. Completed attempts with recovered provider errors remain in the accuracy cohort when model/tool identity and grading are valid; missing raw usage leaves their total estimate unknown and budget-eligible success unverified.

Failed response events can contain multiple observations of the same failed response; failed assistant replies are counted separately. A recorded request is a provider-request intent, not proof an HTTP transaction completed. Tool errors are not model-response errors.

A grading module-load indicator is diagnostic, not automatically an infrastructure exclusion: an actor can introduce a bad import. The documented v1 integration dependency-container defect is explicitly invalid regardless of provisional v1 codingFailure labels. Q03 remains held. Unpaired or incomplete cells are not pooled into paired comparisons.

Independent deterministic replay summaries and their interpretation layer are retained in normalized.json. A replay never makes an invalid original environment valid or silently rewrites a recorded grade. Timing-limited replay observations must be read with their unchanged-baseline controls and assessment.

Source snapshot hashes make the current inputs auditable; later reruns may include newly appended receipts and will produce a new provisional snapshot.

## Paired cost observability

Pairs with complete cost on both sides: i01, i02, i03, q01, q02, q04, s02, s03. This is a labeled subset; it does not replace the full valid accuracy cohort.
Across all current valid pairs, Suffice total: $0.540464; native Pi known lower bound: $0.681877; native Pi complete total: unknown.
Suffice complete total below native Pi known lower bound: True. This is a provisional arithmetic bound, not a final efficacy verdict or a budget certificate for unknown-cost Pi attempts.
