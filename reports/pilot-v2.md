# Campaign pilot-v2

AI-authored synthetic pilot tasks. Descriptive results; no significance claim.

Means show known telemetry coverage in parentheses. Subscription costs are API-equivalent estimates, not billed subscription spend. Total estimated cost also includes watcher estimates. Unknown costs are not zero.

| Variant | Recorded / scheduled | ITT success | Treated-valid success | Main API-equivalent mean $ | Total estimated mean $ | Mean latency ms | Mean total tokens | Mean cache reads | Mean watcher calls | Mean injections | Mean watcher errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| core | 2/4 | 1/4 | 1/1 | 0.018408 (1/4) | 0.018408 (1/4) | 36889.0 (2/4) | 4524.5 (2/4) | 1792.0 (2/4) | 0.0 (2/4) | 0.0 (2/4) | 0.0 (2/4) |
| jev | 1/4 | 1/4 | 1/1 | 0.017165 (1/4) | 0.017217 (1/4) | 54339.0 (1/4) | 10321.0 (1/4) | 3712.0 (1/4) | 1.0 (1/4) | 1.0 (1/4) | 0.0 (1/4) |
| lightning | 1/4 | 1/4 | 1/1 | 0.020676 (1/4) | 0.020676 (1/4) | 46738.0 (1/4) | 10137.0 (1/4) | 2304.0 (1/4) | 1.0 (1/4) | 1.0 (1/4) | 0.0 (1/4) |
| luna | 1/4 | 1/4 | 1/1 | 0.018579 (1/4) | 0.018691 (1/4) | 61644.0 (1/4) | 10194.0 (1/4) | 3712.0 (1/4) | 1.0 (1/4) | 1.0 (1/4) | 0.0 (1/4) |
| nemotron | 1/4 | 1/4 | 1/1 | 0.021950 (1/4) | 0.021950 (1/4) | 46390.0 (1/4) | 10338.0 (1/4) | 2304.0 (1/4) | 1.0 (1/4) | 1.0 (1/4) | 0.0 (1/4) |
| pi | 1/4 | 1/4 | 1/1 | 0.023568 (1/4) | 0.023568 (1/4) | 60762.0 (1/4) | 12988.0 (1/4) | 5120.0 (1/4) | 0.0 (1/4) | 0.0 (1/4) | 0.0 (1/4) |
| rules | 2/4 | 1/4 | 1/1 | 0.025656 (1/4) | 0.025656 (1/4) | 33460.0 (2/4) | 4672.0 (2/4) | 0.0 (2/4) | 0.5 (2/4) | 0.5 (2/4) | 0.0 (2/4) |

Costs per operational success include all known attempted-run costs, including unsuccessful runs. A partial lower bound is shown separately from a fully covered ratio.

| Variant | Known cost components $ | Complete cost coverage | Cost / success $ | Known cost / success lower bound $ | Status counts | Valid-subset exclusions | Watcher error codes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| core | 0.018408 | 1/4 | unknown | 0.018408 | completed: 1, provider_error: 1, missing_result: 2 | main_not_completed: 3, main_cost_unknown: 3, acceptance_unavailable: 2, watcher_cost_unknown: 2, watcher_record_missing: 2 | none |
| jev | 0.017217 | 1/4 | unknown | 0.017217 | completed: 1, missing_result: 3 | main_not_completed: 3, acceptance_unavailable: 3, main_cost_unknown: 3, watcher_cost_unknown: 3, watcher_record_missing: 3 | none |
| lightning | 0.020676 | 1/4 | unknown | 0.020676 | completed: 1, missing_result: 3 | main_not_completed: 3, acceptance_unavailable: 3, main_cost_unknown: 3, watcher_cost_unknown: 3, watcher_record_missing: 3 | none |
| luna | 0.018691 | 1/4 | unknown | 0.018691 | completed: 1, missing_result: 3 | main_not_completed: 3, acceptance_unavailable: 3, main_cost_unknown: 3, watcher_cost_unknown: 3, watcher_record_missing: 3 | none |
| nemotron | 0.021950 | 1/4 | unknown | 0.021950 | completed: 1, missing_result: 3 | main_not_completed: 3, acceptance_unavailable: 3, main_cost_unknown: 3, watcher_cost_unknown: 3, watcher_record_missing: 3 | none |
| pi | 0.023568 | 1/4 | unknown | 0.023568 | completed: 1, missing_result: 3 | main_not_completed: 3, acceptance_unavailable: 3, main_cost_unknown: 3, watcher_cost_unknown: 3, watcher_record_missing: 3 | none |
| rules | 0.025656 | 1/4 | unknown | 0.025656 | completed: 1, provider_error: 1, missing_result: 2 | main_not_completed: 3, main_cost_unknown: 3, acceptance_unavailable: 2, watcher_cost_unknown: 2, watcher_record_missing: 2 | none |

Intervention rates describe availability: a valid watcher arm may have no eligible source-read event. A watcher error remains an operational outcome even when the main agent succeeds.

| Variant | Runs with watcher calls | Runs with injection / recorded | Injection rate among eligible runs |
| --- | --- | --- | --- |
| core | 0 | 0/2 | unknown |
| jev | 1 | 1/1 | 1.000 |
| lightning | 1 | 1/1 | 1.000 |
| luna | 1 | 1/1 | 1.000 |
| nemotron | 1 | 1/1 | 1.000 |
| pi | 0 | 0/1 | unknown |
| rules | 1 | 1/2 | 1.000 |

Jev usage-based estimates and global ledger reserves are separate. Estimates require returned input usage after dispatch; the $0.01 reservation on a failed request is not measured spend. Explicitly undispatched preflight failures have zero inference spend.

| Variant | Jev known estimated spend $ | Known / unknown Jev calls | Recorded reservations $ (coverage) |
| --- | --- | --- | --- |
| jev | 0.000051 | 1/0 | 0.01 (1/1) |

Global Jev ledger: $0.02 reserved of $2.00, 2 reservations. This spans campaigns and is not campaign-attributed spend.

Paired differences are variant minus baseline on the same task and repetition. Operational success differences include failures; valid efficacy differences require both arms to be valid. Positive cost/latency differences mean greater resource use.

| Baseline | Variant | Task | Repetition | Valid pair | ITT success delta | Valid success delta | Estimated $ delta | Latency ms delta | Total token delta | Cache-read delta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| core | jev | retry-idempotency | 0 | true | 0 | 0 | -0.001192 | 275.0 | 1272 | 128 |
| core | lightning | retry-idempotency | 0 | true | 0 | 0 | 0.002268 | -7326.0 | 1088 | -1280 |
| core | luna | retry-idempotency | 0 | true | 0 | 0 | 0.000283 | 7580.0 | 1145 | 128 |
| core | nemotron | retry-idempotency | 0 | true | 0 | 0 | 0.003542 | -7674.0 | 1289 | -1280 |
| core | pi | retry-idempotency | 0 | true | 0 | 0 | 0.005160 | 6698.0 | 3939 | 1536 |
| core | rules | cursor-pagination | 0 | false | 0 | unknown | unknown | 211.0 | 0 | 0 |
| core | rules | retry-idempotency | 0 | true | 0 | 0 | 0.007248 | -7069.0 | 295 | -3584 |
| pi | core | retry-idempotency | 0 | true | 0 | 0 | -0.005160 | -6698.0 | -3939 | -1536 |
| pi | jev | retry-idempotency | 0 | true | 0 | 0 | -0.006351 | -6423.0 | -2667 | -1408 |
| pi | lightning | retry-idempotency | 0 | true | 0 | 0 | -0.002892 | -14024.0 | -2851 | -2816 |
| pi | luna | retry-idempotency | 0 | true | 0 | 0 | -0.004877 | 882.0 | -2794 | -1408 |
| pi | nemotron | retry-idempotency | 0 | true | 0 | 0 | -0.001618 | -14372.0 | -2650 | -2816 |
| pi | rules | retry-idempotency | 0 | true | 0 | 0 | 0.002088 | -13767.0 | -3644 | -5120 |

Frozen manifest SHA-256: `7d7e6f8ecd11d613328a171e53182fd7775a9842c7c04c07937b6357e14609ef`.

Local evidence links point to ignored run files on this machine; raw run output is not embedded in this report.

- [001-retry-idempotency-pi-r0](../.suffice/runs/pilot-v2/001-retry-idempotency-pi-r0/result.json)
- [002-retry-idempotency-core-r0](../.suffice/runs/pilot-v2/002-retry-idempotency-core-r0/result.json)
- [003-retry-idempotency-rules-r0](../.suffice/runs/pilot-v2/003-retry-idempotency-rules-r0/result.json)
- [004-retry-idempotency-luna-r0](../.suffice/runs/pilot-v2/004-retry-idempotency-luna-r0/result.json)
- [005-retry-idempotency-jev-r0](../.suffice/runs/pilot-v2/005-retry-idempotency-jev-r0/result.json)
- [006-retry-idempotency-lightning-r0](../.suffice/runs/pilot-v2/006-retry-idempotency-lightning-r0/result.json)
- [007-retry-idempotency-nemotron-r0](../.suffice/runs/pilot-v2/007-retry-idempotency-nemotron-r0/result.json)
- [008-cursor-pagination-core-r0](../.suffice/runs/pilot-v2/008-cursor-pagination-core-r0/result.json)
- [009-cursor-pagination-rules-r0](../.suffice/runs/pilot-v2/009-cursor-pagination-rules-r0/result.json)

- Descriptive pilot only; small samples do not establish significance or real-world performance.
- Core versus Pi compares a prompt/tool bundle; watcher versus core compares an added observer.
- Intention-to-treat operational success includes scheduled missing results and provider/watcher failures. Missing results are incomplete executions, not evidence of model inability.
- Treated-valid efficacy excludes unavailable acceptance, main failure, missing cost telemetry, watcher errors, and missing decision records. This selected subset is descriptive and can be biased.
- Costs are API-equivalent estimates for subscription models plus estimated external watcher spend, not an actual subscription bill or verified provider invoice.
- Known cost includes failed attempts and known components of partially costed runs. Incomplete cost/success is a nonnegative lower bound; null never means zero.
- Jev ledger reservations are conservative budget consumption, separate from usage-based estimated spend; global reservations cannot be attributed to a campaign.
- Provider cache warmth was observed rather than controlled. Fixed task/repetition pairs do not remove order or availability effects.
