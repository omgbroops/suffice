# Campaign integration-core

AI-authored synthetic pilot tasks. Descriptive results; no significance claim.

Means show known telemetry coverage in parentheses. Subscription costs are API-equivalent estimates, not billed subscription spend. Total estimated cost also includes watcher estimates. Unknown costs are not zero.

| Variant | Recorded / scheduled | ITT success | Treated-valid success | Main API-equivalent mean $ | Total estimated mean $ | Mean latency ms | Mean total tokens | Mean cache reads | Mean watcher calls | Mean injections | Mean watcher errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| core | 1/1 | 1/1 | 1/1 | 0.025690 (1/1) | 0.025690 (1/1) | 46036.0 (1/1) | 9157.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) |
| luna | 1/1 | 1/1 | 1/1 | 0.018897 (1/1) | 0.019010 (1/1) | 61119.0 (1/1) | 10254.0 (1/1) | 3712.0 (1/1) | 1.0 (1/1) | 1.0 (1/1) | 0.0 (1/1) |

Costs per operational success include all known attempted-run costs, including unsuccessful runs. A partial lower bound is shown separately from a fully covered ratio.

| Variant | Known cost components $ | Complete cost coverage | Cost / success $ | Known cost / success lower bound $ | Status counts | Valid-subset exclusions | Watcher error codes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| core | 0.025690 | 1/1 | 0.025690 | 0.025690 | completed: 1 | none | none |
| luna | 0.019010 | 1/1 | 0.019010 | 0.019010 | completed: 1 | none | none |

Intervention rates describe availability: a valid watcher arm may have no eligible source-read event. A watcher error remains an operational outcome even when the main agent succeeds.

| Variant | Runs with watcher calls | Runs with injection / recorded | Injection rate among eligible runs |
| --- | --- | --- | --- |
| core | 0 | 0/1 | unknown |
| luna | 1 | 1/1 | 1.000 |

Jev usage-based estimates and global ledger reserves are separate. Estimates require returned input usage after dispatch; the $0.01 reservation on a failed request is not measured spend. Explicitly undispatched preflight failures have zero inference spend.

| Variant | Jev known estimated spend $ | Known / unknown Jev calls | Recorded reservations $ (coverage) |
| --- | --- | --- | --- |

Global Jev ledger: $0.01 reserved of $2.00, 1 reservations. This spans campaigns and is not campaign-attributed spend.

Paired differences are variant minus baseline on the same task and repetition. Operational success differences include failures; valid efficacy differences require both arms to be valid. Positive cost/latency differences mean greater resource use.

| Baseline | Variant | Task | Repetition | Valid pair | ITT success delta | Valid success delta | Estimated $ delta | Latency ms delta | Total token delta | Cache-read delta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| core | luna | retry-idempotency | 0 | true | 0 | 0 | -0.006680 | 15083.0 | 1097 | 3712 |

Frozen manifest SHA-256: `27f40e89a7096503c4db06acd16cab38462a3ecdc574da961f3f2b3c61d92242`.

Local evidence links point to ignored run files on this machine; raw run output is not embedded in this report.

- [001-retry-idempotency-core-r0](../.suffice/runs/integration-core/001-retry-idempotency-core-r0/result.json)
- [002-retry-idempotency-luna-r0](../.suffice/runs/integration-core/002-retry-idempotency-luna-r0/result.json)

- Descriptive pilot only; small samples do not establish significance or real-world performance.
- Core versus Pi compares a prompt/tool bundle; watcher versus core compares an added observer.
- Intention-to-treat operational success includes scheduled missing results and provider/watcher failures. Missing results are incomplete executions, not evidence of model inability.
- Treated-valid efficacy excludes unavailable acceptance, main failure, missing cost telemetry, watcher errors, and missing decision records. This selected subset is descriptive and can be biased.
- Costs are API-equivalent estimates for subscription models plus estimated external watcher spend, not an actual subscription bill or verified provider invoice.
- Known cost includes failed attempts and known components of partially costed runs. Incomplete cost/success is a nonnegative lower bound; null never means zero.
- Jev ledger reservations are conservative budget consumption, separate from usage-based estimated spend; global reservations cannot be attributed to a campaign.
- Provider cache warmth was observed rather than controlled. Fixed task/repetition pairs do not remove order or availability effects.
