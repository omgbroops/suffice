# Campaign watcher-availability-v1

AI-authored synthetic pilot tasks. Descriptive results; no significance claim.

Means show known telemetry coverage in parentheses. Subscription costs are API-equivalent estimates, not billed subscription spend. Total estimated cost also includes watcher estimates. Unknown costs are not zero.

| Variant | Recorded / scheduled | ITT success | Treated-valid success | Main API-equivalent mean $ | Total estimated mean $ | Mean latency ms | Mean total tokens | Mean cache reads | Mean watcher calls | Mean injections | Mean watcher errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| jev | 1/1 | 0/1 | 0/0 | unknown (0/1) | unknown (0/1) | 1280.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) |
| lightning | 1/1 | 1/1 | 1/1 | 0.012674 (1/1) | 0.012674 (1/1) | 42531.0 (1/1) | 9012.0 (1/1) | 3584.0 (1/1) | 1.0 (1/1) | 1.0 (1/1) | 0.0 (1/1) |
| luna | 1/1 | 1/1 | 1/1 | 0.012282 (1/1) | 0.012360 (1/1) | 42722.0 (1/1) | 8907.0 (1/1) | 3584.0 (1/1) | 1.0 (1/1) | 1.0 (1/1) | 0.0 (1/1) |
| nemotron | 1/1 | 1/1 | 1/1 | 0.014233 (1/1) | 0.014233 (1/1) | 28334.0 (1/1) | 8540.0 (1/1) | 2048.0 (1/1) | 1.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) |

Costs per operational success include all known attempted-run costs, including unsuccessful runs. A partial lower bound is shown separately from a fully covered ratio.

| Variant | Known cost components $ | Complete cost coverage | Cost / success $ | Known cost / success lower bound $ | Status counts | Valid-subset exclusions | Watcher error codes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| jev | 0.000000 | 0/1 | unknown | unknown | provider_error: 1 | main_not_completed: 1, main_cost_unknown: 1 | none |
| lightning | 0.012674 | 1/1 | 0.012674 | 0.012674 | completed: 1 | none | none |
| luna | 0.012360 | 1/1 | 0.012360 | 0.012360 | completed: 1 | none | none |
| nemotron | 0.014233 | 1/1 | 0.014233 | 0.014233 | completed: 1 | none | none |

Intervention rates describe availability: a valid watcher arm may have no eligible source-read event. A watcher error remains an operational outcome even when the main agent succeeds.

| Variant | Runs with watcher calls | Runs with injection / recorded | Injection rate among eligible runs |
| --- | --- | --- | --- |
| jev | 0 | 0/1 | unknown |
| lightning | 1 | 1/1 | 1.000 |
| luna | 1 | 1/1 | 1.000 |
| nemotron | 1 | 0/1 | 0.000 |

Jev usage-based estimates and global ledger reserves are separate. Estimates require returned input usage after dispatch; the $0.01 reservation on a failed request is not measured spend. Explicitly undispatched preflight failures have zero inference spend.

| Variant | Jev known estimated spend $ | Known / unknown Jev calls | Recorded reservations $ (coverage) |
| --- | --- | --- | --- |
| jev | unknown | 0/0 | unknown (0/0) |

Global Jev ledger: $0.01 reserved of $2.00, 1 reservations. This spans campaigns and is not campaign-attributed spend.

Paired differences are variant minus baseline on the same task and repetition. Operational success differences include failures; valid efficacy differences require both arms to be valid. Positive cost/latency differences mean greater resource use.

| Baseline | Variant | Task | Repetition | Valid pair | ITT success delta | Valid success delta | Estimated $ delta | Latency ms delta | Total token delta | Cache-read delta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

No recorded matched pairs are available.

Frozen manifest SHA-256: `e318a3f1dda38ba55a343a8e46a4a731c3b7c12b12fdef5d86f469b32233ea60`.

Local evidence links point to ignored run files on this machine; raw run output is not embedded in this report.

- [001-cursor-pagination-luna-r0](../.suffice/runs/watcher-availability-v1/001-cursor-pagination-luna-r0/result.json)
- [002-cursor-pagination-jev-r0](../.suffice/runs/watcher-availability-v1/002-cursor-pagination-jev-r0/result.json)
- [003-cursor-pagination-lightning-r0](../.suffice/runs/watcher-availability-v1/003-cursor-pagination-lightning-r0/result.json)
- [004-cursor-pagination-nemotron-r0](../.suffice/runs/watcher-availability-v1/004-cursor-pagination-nemotron-r0/result.json)

- Descriptive pilot only; small samples do not establish significance or real-world performance.
- Core versus Pi compares a prompt/tool bundle; watcher versus core compares an added observer.
- Intention-to-treat operational success includes scheduled missing results and provider/watcher failures. Missing results are incomplete executions, not evidence of model inability.
- Treated-valid efficacy excludes unavailable acceptance, main failure, missing cost telemetry, watcher errors, and missing decision records. This selected subset is descriptive and can be biased.
- Costs are API-equivalent estimates for subscription models plus estimated external watcher spend, not an actual subscription bill or verified provider invoice.
- Known cost includes failed attempts and known components of partially costed runs. Incomplete cost/success is a nonnegative lower bound; null never means zero.
- Jev ledger reservations are conservative budget consumption, separate from usage-based estimated spend; global reservations cannot be attributed to a campaign.
- Provider cache warmth was observed rather than controlled. Fixed task/repetition pairs do not remove order or availability effects.
