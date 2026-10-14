# Campaign pilot-v1b

AI-authored synthetic pilot tasks. Descriptive results; no significance claim.

Means show known telemetry coverage in parentheses. Subscription costs are API-equivalent estimates, not billed subscription spend. Total estimated cost also includes watcher estimates. Unknown costs are not zero.

| Variant | Recorded / scheduled | ITT success | Treated-valid success | Main API-equivalent mean $ | Total estimated mean $ | Mean latency ms | Mean total tokens | Mean cache reads | Mean watcher calls | Mean injections | Mean watcher errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| core | 1/4 | 1/4 | 1/1 | 0.019852 (1/4) | 0.019852 (1/4) | 44870.0 (1/4) | 8869.0 (1/4) | 2176.0 (1/4) | 0.0 (1/4) | 0.0 (1/4) | 0.0 (1/4) |
| jev | 1/4 | 0/4 | 0/0 | unknown (0/4) | unknown (0/4) | 1592.0 (1/4) | 0.0 (1/4) | 0.0 (1/4) | 0.0 (1/4) | 0.0 (1/4) | 0.0 (1/4) |
| lightning | 0/4 | 0/4 | 0/0 | unknown (0/4) | unknown (0/4) | unknown (0/4) | unknown (0/4) | unknown (0/4) | unknown (0/4) | unknown (0/4) | unknown (0/4) |
| luna | 1/4 | 0/4 | 0/0 | unknown (0/4) | unknown (0/4) | 2436.0 (1/4) | 0.0 (1/4) | 0.0 (1/4) | 0.0 (1/4) | 0.0 (1/4) | 0.0 (1/4) |
| nemotron | 0/4 | 0/4 | 0/0 | unknown (0/4) | unknown (0/4) | unknown (0/4) | unknown (0/4) | unknown (0/4) | unknown (0/4) | unknown (0/4) | unknown (0/4) |
| pi | 1/4 | 0/4 | 0/0 | unknown (0/4) | unknown (0/4) | 1446.0 (1/4) | 0.0 (1/4) | 0.0 (1/4) | 0.0 (1/4) | 0.0 (1/4) | 0.0 (1/4) |
| rules | 1/4 | 1/4 | 1/1 | 0.022263 (1/4) | 0.022263 (1/4) | 46132.0 (1/4) | 9229.0 (1/4) | 1408.0 (1/4) | 1.0 (1/4) | 1.0 (1/4) | 0.0 (1/4) |

Costs per operational success include all known attempted-run costs, including unsuccessful runs. A partial lower bound is shown separately from a fully covered ratio.

| Variant | Known cost components $ | Complete cost coverage | Cost / success $ | Known cost / success lower bound $ | Status counts | Valid-subset exclusions | Watcher error codes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| core | 0.019852 | 1/4 | unknown | 0.019852 | completed: 1, missing_result: 3 | main_not_completed: 3, acceptance_unavailable: 3, main_cost_unknown: 3, watcher_cost_unknown: 3, watcher_record_missing: 3 | none |
| jev | 0.000000 | 0/4 | unknown | unknown | provider_error: 1, missing_result: 3 | main_not_completed: 4, main_cost_unknown: 4, acceptance_unavailable: 3, watcher_cost_unknown: 3, watcher_record_missing: 3 | none |
| lightning | unknown | 0/4 | unknown | unknown | missing_result: 4 | main_not_completed: 4, acceptance_unavailable: 4, main_cost_unknown: 4, watcher_cost_unknown: 4, watcher_record_missing: 4 | none |
| luna | 0.000000 | 0/4 | unknown | unknown | provider_error: 1, missing_result: 3 | main_not_completed: 4, main_cost_unknown: 4, acceptance_unavailable: 3, watcher_cost_unknown: 3, watcher_record_missing: 3 | none |
| nemotron | unknown | 0/4 | unknown | unknown | missing_result: 4 | main_not_completed: 4, acceptance_unavailable: 4, main_cost_unknown: 4, watcher_cost_unknown: 4, watcher_record_missing: 4 | none |
| pi | 0.000000 | 0/4 | unknown | unknown | provider_error: 1, missing_result: 3 | main_not_completed: 4, main_cost_unknown: 4, acceptance_unavailable: 3, watcher_cost_unknown: 3, watcher_record_missing: 3 | none |
| rules | 0.022263 | 1/4 | unknown | 0.022263 | completed: 1, missing_result: 3 | main_not_completed: 3, acceptance_unavailable: 3, main_cost_unknown: 3, watcher_cost_unknown: 3, watcher_record_missing: 3 | none |

Intervention rates describe availability: a valid watcher arm may have no eligible source-read event. A watcher error remains an operational outcome even when the main agent succeeds.

| Variant | Runs with watcher calls | Runs with injection / recorded | Injection rate among eligible runs |
| --- | --- | --- | --- |
| core | 0 | 0/1 | unknown |
| jev | 0 | 0/1 | unknown |
| lightning | 0 | 0/0 | unknown |
| luna | 0 | 0/1 | unknown |
| nemotron | 0 | 0/0 | unknown |
| pi | 0 | 0/1 | unknown |
| rules | 1 | 1/1 | 1.000 |

Jev usage-based estimates and global ledger reserves are separate. Estimates require returned input usage after dispatch; the $0.01 reservation on a failed request is not measured spend. Explicitly undispatched preflight failures have zero inference spend.

| Variant | Jev known estimated spend $ | Known / unknown Jev calls | Recorded reservations $ (coverage) |
| --- | --- | --- | --- |
| jev | unknown | 0/0 | unknown (0/0) |

Global Jev ledger: $0.01 reserved of $2.00, 1 reservations. This spans campaigns and is not campaign-attributed spend.

Paired differences are variant minus baseline on the same task and repetition. Operational success differences include failures; valid efficacy differences require both arms to be valid. Positive cost/latency differences mean greater resource use.

| Baseline | Variant | Task | Repetition | Valid pair | ITT success delta | Valid success delta | Estimated $ delta | Latency ms delta | Total token delta | Cache-read delta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| core | jev | retry-idempotency | 0 | false | -1 | unknown | unknown | -43278.0 | -8869 | -2176 |
| core | luna | retry-idempotency | 0 | false | -1 | unknown | unknown | -42434.0 | -8869 | -2176 |
| core | pi | retry-idempotency | 0 | false | -1 | unknown | unknown | -43424.0 | -8869 | -2176 |
| core | rules | retry-idempotency | 0 | true | 0 | 0 | 0.002411 | 1262.0 | 360 | -768 |
| pi | core | retry-idempotency | 0 | false | 1 | unknown | unknown | 43424.0 | 8869 | 2176 |
| pi | jev | retry-idempotency | 0 | false | 0 | unknown | unknown | 146.0 | 0 | 0 |
| pi | luna | retry-idempotency | 0 | false | 0 | unknown | unknown | 990.0 | 0 | 0 |
| pi | rules | retry-idempotency | 0 | false | 1 | unknown | unknown | 44686.0 | 9229 | 1408 |

Frozen manifest SHA-256: `e4e4a54900d893fd3e10bc7afcf19b69edeb8c3bae3def5f571afddeffd3c03a`.

Local evidence links point to ignored run files on this machine; raw run output is not embedded in this report.

- [001-retry-idempotency-pi-r0](../.suffice/runs/pilot-v1b/001-retry-idempotency-pi-r0/result.json)
- [002-retry-idempotency-core-r0](../.suffice/runs/pilot-v1b/002-retry-idempotency-core-r0/result.json)
- [003-retry-idempotency-rules-r0](../.suffice/runs/pilot-v1b/003-retry-idempotency-rules-r0/result.json)
- [004-retry-idempotency-luna-r0](../.suffice/runs/pilot-v1b/004-retry-idempotency-luna-r0/result.json)
- [005-retry-idempotency-jev-r0](../.suffice/runs/pilot-v1b/005-retry-idempotency-jev-r0/result.json)

- Descriptive pilot only; small samples do not establish significance or real-world performance.
- Core versus Pi compares a prompt/tool bundle; watcher versus core compares an added observer.
- Intention-to-treat operational success includes scheduled missing results and provider/watcher failures. Missing results are incomplete executions, not evidence of model inability.
- Treated-valid efficacy excludes unavailable acceptance, main failure, missing cost telemetry, watcher errors, and missing decision records. This selected subset is descriptive and can be biased.
- Costs are API-equivalent estimates for subscription models plus estimated external watcher spend, not an actual subscription bill or verified provider invoice.
- Known cost includes failed attempts and known components of partially costed runs. Incomplete cost/success is a nonnegative lower bound; null never means zero.
- Jev ledger reservations are conservative budget consumption, separate from usage-based estimated spend; global reservations cannot be attributed to a campaign.
- Provider cache warmth was observed rather than controlled. Fixed task/repetition pairs do not remove order or availability effects.
