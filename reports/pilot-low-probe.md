# Campaign pilot-low-probe

AI-authored synthetic pilot tasks. Descriptive results; no significance claim.

Means show known telemetry coverage in parentheses. Subscription costs are API-equivalent estimates, not billed subscription spend. Total estimated cost also includes watcher estimates. Unknown costs are not zero.

| Variant | Recorded / scheduled | ITT success | Treated-valid success | Main API-equivalent mean $ | Total estimated mean $ | Mean latency ms | Mean total tokens | Mean cache reads | Mean watcher calls | Mean injections | Mean watcher errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| core | 1/1 | 1/1 | 1/1 | 0.012057 (1/1) | 0.012057 (1/1) | 30698.0 (1/1) | 7770.0 (1/1) | 3328.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) |
| jev | 1/1 | 1/1 | 1/1 | 0.016016 (1/1) | 0.016064 (1/1) | 31091.0 (1/1) | 9165.0 (1/1) | 1280.0 (1/1) | 1.0 (1/1) | 1.0 (1/1) | 0.0 (1/1) |
| jev-gated | 1/1 | 1/1 | 0/0 | unknown (0/1) | unknown (0/1) | 46191.0 (1/1) | 7786.0 (1/1) | 3328.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) |

Costs per operational success include all known attempted-run costs, including unsuccessful runs. A partial lower bound is shown separately from a fully covered ratio.

| Variant | Known cost components $ | Complete cost coverage | Cost / success $ | Known cost / success lower bound $ | Status counts | Valid-subset exclusions | Watcher error codes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| core | 0.012057 | 1/1 | 0.012057 | 0.012057 | completed: 1 | none | none |
| jev | 0.016064 | 1/1 | 0.016064 | 0.016064 | completed: 1 | none | none |
| jev-gated | 0.000000 | 0/1 | unknown | 0.000000 | completed: 1 | main_cost_unknown: 1 | none |

Intervention rates describe availability: a valid watcher arm may have no eligible source-read event. A watcher error remains an operational outcome even when the main agent succeeds.

| Variant | Runs with watcher calls | Runs with injection / recorded | Injection rate among eligible runs |
| --- | --- | --- | --- |
| core | 0 | 0/1 | unknown |
| jev | 1 | 1/1 | 1.000 |
| jev-gated | 0 | 0/1 | unknown |

Jev usage-based estimates and global ledger reserves are separate. Estimates require returned input usage after dispatch; the $0.01 reservation on a failed request is not measured spend. Explicitly undispatched preflight failures have zero inference spend.

| Variant | Jev known estimated spend $ | Known / unknown Jev calls | Recorded reservations $ (coverage) |
| --- | --- | --- | --- |
| jev | 0.000048 | 1/0 | 0.01 (1/1) |

Global Jev ledger: $0.03 reserved of $2.00, 3 reservations. This spans campaigns and is not campaign-attributed spend.

Paired differences are variant minus baseline on the same task and repetition. Operational success differences include failures; valid efficacy differences require both arms to be valid. Positive cost/latency differences mean greater resource use.

| Baseline | Variant | Task | Repetition | Valid pair | ITT success delta | Valid success delta | Estimated $ delta | Latency ms delta | Total token delta | Cache-read delta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| core | jev-gated | cursor-pagination | 0 | false | 0 | unknown | unknown | 15493.0 | 16 | 0 |
| core | jev | cursor-pagination | 0 | true | 0 | 0 | 0.004007 | 393.0 | 1395 | -2048 |

Frozen manifest SHA-256: `76d16d1433f0001e4b69f6828cf8f45cb34f818ad45436273fbb41ed9d44a44c`.

Local evidence links point to ignored run files on this machine; raw run output is not embedded in this report.

- [001-cursor-pagination-core-r0](../.suffice/runs/pilot-low-probe/001-cursor-pagination-core-r0/result.json)
- [002-cursor-pagination-jev-r0](../.suffice/runs/pilot-low-probe/002-cursor-pagination-jev-r0/result.json)
- [003-cursor-pagination-jev-gated-r0](../.suffice/runs/pilot-low-probe/003-cursor-pagination-jev-gated-r0/result.json)

- Descriptive pilot only; small samples do not establish significance or real-world performance.
- Core versus Pi compares a prompt/tool bundle; watcher versus core compares an added observer.
- Intention-to-treat operational success includes scheduled missing results and provider/watcher failures. Missing results are incomplete executions, not evidence of model inability.
- Treated-valid efficacy excludes unavailable acceptance, main failure, missing cost telemetry, watcher errors, and missing decision records. This selected subset is descriptive and can be biased.
- Costs are API-equivalent estimates for subscription models plus estimated external watcher spend, not an actual subscription bill or verified provider invoice.
- Known cost includes failed attempts and known components of partially costed runs. Incomplete cost/success is a nonnegative lower bound; null never means zero.
- Jev ledger reservations are conservative budget consumption, separate from usage-based estimated spend; global reservations cannot be attributed to a campaign.
- Provider cache warmth was observed rather than controlled. Fixed task/repetition pairs do not remove order or availability effects.
