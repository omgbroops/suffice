# Campaign context-screen-v4

AI-authored synthetic context tasks. Descriptive results; no significance claim.

Main model: variant-specific: gpt-6.1-sol or gpt-6-luna; reasoning effort: low. Compare arms within this campaign; do not pool different effort settings.

Means show known telemetry coverage in parentheses. Subscription costs are API-equivalent estimates, not billed subscription spend. Total estimated cost also includes watcher estimates. Unknown costs are not zero.

| Variant | Recorded / scheduled | ITT success | Treated-valid success | Main API-equivalent mean $ | Total estimated mean $ | Mean latency ms | Mean total tokens | Mean cache reads | Mean watcher calls | Mean injections | Mean watcher errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| bounded | 1/1 | 1/1 | 1/1 | 0.020496 (1/1) | 0.020496 (1/1) | 25595.0 (1/1) | 13283.0 (1/1) | 5376.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) |
| cache-select | 1/1 | 1/1 | 1/1 | 0.018271 (1/1) | 0.018271 (1/1) | 45248.0 (1/1) | 13386.0 (1/1) | 6912.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) |
| compact | 1/1 | 0/1 | 0/0 | unknown (0/1) | unknown (0/1) | 63213.0 (1/1) | 28492.0 (1/1) | 2048.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) |
| core | 1/1 | 1/1 | 1/1 | 0.028778 (1/1) | 0.028778 (1/1) | 33944.0 (1/1) | 13258.0 (1/1) | 1024.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) |
| default-code | 1/1 | 1/1 | 1/1 | 0.031681 (1/1) | 0.031681 (1/1) | 32790.0 (1/1) | 14642.0 (1/1) | 1408.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) |
| delegate | 1/1 | 1/1 | 1/1 | 0.019244 (1/1) | 0.027430 (1/1) | 66098.0 (1/1) | 17058.0 (1/1) | 7296.0 (1/1) | 2.0 (1/1) | 2.0 (1/1) | 0.0 (1/1) |
| graph | 1/1 | 1/1 | 1/1 | 0.020033 (1/1) | 0.020033 (1/1) | 26474.0 (1/1) | 14338.0 (1/1) | 6528.0 (1/1) | 4.0 (1/1) | 4.0 (1/1) | 0.0 (1/1) |
| luna | 1/1 | 1/1 | 1/1 | 0.021933 (1/1) | 0.022616 (1/1) | 54723.0 (1/1) | 20213.0 (1/1) | 6528.0 (1/1) | 4.0 (1/1) | 4.0 (1/1) | 0.0 (1/1) |
| luna-worker | 1/1 | 1/1 | 1/1 | 0.001343 (1/1) | 0.001343 (1/1) | 24276.0 (1/1) | 24389.0 (1/1) | 14336.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) |
| pi | 1/1 | 1/1 | 1/1 | 0.044324 (1/1) | 0.044324 (1/1) | 52584.0 (1/1) | 21089.0 (1/1) | 2816.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) |
| route | 1/1 | 1/1 | 1/1 | 0.033329 (1/1) | 0.033329 (1/1) | 35544.0 (1/1) | 15380.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) |
| select-gemma | 1/1 | 1/1 | 0/0 | 0.023413 (1/1) | unknown (0/1) | 35107.0 (1/1) | unknown (0/1) | 4352.0 (1/1) | 2.0 (1/1) | 0.0 (1/1) | 2.0 (1/1) |
| select-jev | 1/1 | 0/1 | 0/0 | unknown (0/1) | unknown (0/1) | 151425.0 (1/1) | 105597.0 (1/1) | 20480.0 (1/1) | 4.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) |
| select-lightning | 1/1 | 0/1 | 0/0 | unknown (0/1) | unknown (0/1) | 68335.0 (1/1) | 38798.0 (1/1) | 2048.0 (1/1) | 4.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) |
| select-luna | 1/1 | 0/1 | 0/0 | unknown (0/1) | unknown (0/1) | 180011.0 (1/1) | 98194.0 (1/1) | 15232.0 (1/1) | 4.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) |
| select-nemotron | 1/1 | 0/1 | 0/0 | unknown (0/1) | unknown (0/1) | 115586.0 (1/1) | 43995.0 (1/1) | 8192.0 (1/1) | 4.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) |
| select-rules | 1/1 | 0/1 | 0/0 | unknown (0/1) | unknown (0/1) | 62379.0 (1/1) | 30484.0 (1/1) | 1024.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) |
| short-direct | 1/1 | 1/1 | 1/1 | 0.042398 (1/1) | 0.042398 (1/1) | 49320.0 (1/1) | 17803.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) |

Costs per operational success include all known attempted-run costs, including unsuccessful runs. A partial lower bound is shown separately from a fully covered ratio.

| Variant | Known cost components $ | Complete cost coverage | Cost / success $ | Known cost / success lower bound $ | Status counts | Valid-subset exclusions | Watcher error codes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| bounded | 0.020496 | 1/1 | 0.020496 | 0.020496 | completed: 1 | none | none |
| cache-select | 0.018271 | 1/1 | 0.018271 | 0.018271 | completed: 1 | none | none |
| compact | 0.058909 | 0/1 | unknown | unknown | tool_limit: 1 | main_not_completed: 1, main_cost_unknown: 1 | none |
| core | 0.028778 | 1/1 | 0.028778 | 0.028778 | completed: 1 | none | none |
| default-code | 0.031681 | 1/1 | 0.031681 | 0.031681 | completed: 1 | none | none |
| delegate | 0.027430 | 1/1 | 0.027430 | 0.027430 | completed: 1 | none | none |
| graph | 0.020033 | 1/1 | 0.020033 | 0.020033 | completed: 1 | none | none |
| luna | 0.022616 | 1/1 | 0.022616 | 0.022616 | completed: 1 | none | none |
| luna-worker | 0.001343 | 1/1 | 0.001343 | 0.001343 | completed: 1 | none | none |
| pi | 0.044324 | 1/1 | 0.044324 | 0.044324 | completed: 1 | none | none |
| route | 0.033329 | 1/1 | 0.033329 | 0.033329 | completed: 1 | none | none |
| select-gemma | 0.023413 | 0/1 | unknown | 0.023413 | completed: 1 | watcher_cost_unknown: 1, watcher_error: 1, context_treatment_invalid: 1 | HTTP_429: 2 |
| select-jev | 0.162871 | 0/1 | unknown | unknown | tool_limit: 1 | main_not_completed: 1, main_cost_unknown: 1 | none |
| select-lightning | 0.058345 | 0/1 | unknown | unknown | tool_limit: 1 | main_not_completed: 1, main_cost_unknown: 1 | none |
| select-luna | 0.168639 | 0/1 | unknown | unknown | run_timeout: 1 | main_not_completed: 1, main_cost_unknown: 1 | none |
| select-nemotron | 0.055905 | 0/1 | unknown | unknown | tool_limit: 1 | main_not_completed: 1, main_cost_unknown: 1 | none |
| select-rules | 0.063950 | 0/1 | unknown | unknown | tool_limit: 1 | main_not_completed: 1, main_cost_unknown: 1 | none |
| short-direct | 0.042398 | 1/1 | 0.042398 | 0.042398 | completed: 1 | none | none |

Intervention rates describe availability: a valid watcher arm may have no eligible source-read event. A watcher error remains an operational outcome even when the main agent succeeds.

| Variant | Runs with watcher calls | Runs with injection / recorded | Injection rate among eligible runs |
| --- | --- | --- | --- |
| bounded | 0 | 0/1 | unknown |
| cache-select | 0 | 0/1 | unknown |
| compact | 0 | 0/1 | unknown |
| core | 0 | 0/1 | unknown |
| default-code | 0 | 0/1 | unknown |
| delegate | 1 | 1/1 | 1.000 |
| graph | 1 | 1/1 | 1.000 |
| luna | 1 | 1/1 | 1.000 |
| luna-worker | 0 | 0/1 | unknown |
| pi | 0 | 0/1 | unknown |
| route | 0 | 0/1 | unknown |
| select-gemma | 1 | 0/1 | 0.000 |
| select-jev | 1 | 0/1 | 0.000 |
| select-lightning | 1 | 0/1 | 0.000 |
| select-luna | 1 | 0/1 | 0.000 |
| select-nemotron | 1 | 0/1 | 0.000 |
| select-rules | 0 | 0/1 | unknown |
| short-direct | 0 | 0/1 | unknown |

Jev usage-based estimates and global ledger reserves are separate. Estimates require returned input usage after dispatch; the $0.01 reservation on a failed request is not measured spend. Explicitly undispatched preflight failures have zero inference spend.

| Variant | Jev known estimated spend $ | Known / unknown Jev calls | Recorded reservations $ (coverage) |
| --- | --- | --- | --- |
| select-jev | 0.000541 | 4/0 | 0.04 (4/4) |

Global Jev ledger: $0.14 reserved of $2.00, 14 reservations. This spans campaigns and is not campaign-attributed spend.

Paired differences are variant minus baseline on the same task and repetition. Operational success differences include failures; valid efficacy differences require both arms to be valid. Positive cost/latency differences mean greater resource use.

| Baseline | Variant | Task | Repetition | Valid pair | ITT success delta | Valid success delta | Estimated $ delta | Latency ms delta | Total token delta | Cache-read delta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| core | bounded | inventory-reservations | 0 | true | 0 | 0 | -0.008283 | -8349.0 | 25 | 4352 |
| core | cache-select | inventory-reservations | 0 | true | 0 | 0 | -0.010507 | 11304.0 | 128 | 5888 |
| core | compact | inventory-reservations | 0 | false | -1 | unknown | unknown | 29269.0 | 15234 | 1024 |
| core | default-code | inventory-reservations | 0 | true | 0 | 0 | 0.002902 | -1154.0 | 1384 | 384 |
| core | delegate | inventory-reservations | 0 | true | 0 | 0 | -0.001349 | 32154.0 | 3800 | 6272 |
| core | graph | inventory-reservations | 0 | true | 0 | 0 | -0.008746 | -7470.0 | 1080 | 5504 |
| core | luna-worker | inventory-reservations | 0 | true | 0 | 0 | -0.027435 | -9668.0 | 11131 | 13312 |
| core | luna | inventory-reservations | 0 | true | 0 | 0 | -0.006162 | 20779.0 | 6955 | 5504 |
| core | pi | inventory-reservations | 0 | true | 0 | 0 | 0.015545 | 18640.0 | 7831 | 1792 |
| core | route | inventory-reservations | 0 | true | 0 | 0 | 0.004551 | 1600.0 | 2122 | -1024 |
| core | select-gemma | inventory-reservations | 0 | false | 0 | unknown | unknown | 1163.0 | unknown | 3328 |
| core | select-jev | inventory-reservations | 0 | false | -1 | unknown | unknown | 117481.0 | 92339 | 19456 |
| core | select-lightning | inventory-reservations | 0 | false | -1 | unknown | unknown | 34391.0 | 25540 | 1024 |
| core | select-luna | inventory-reservations | 0 | false | -1 | unknown | unknown | 146067.0 | 84936 | 14208 |
| core | select-nemotron | inventory-reservations | 0 | false | -1 | unknown | unknown | 81642.0 | 30737 | 7168 |
| core | select-rules | inventory-reservations | 0 | false | -1 | unknown | unknown | 28435.0 | 17226 | 0 |
| core | short-direct | inventory-reservations | 0 | true | 0 | 0 | 0.013620 | 15376.0 | 4545 | -1024 |
| pi | bounded | inventory-reservations | 0 | true | 0 | 0 | -0.023828 | -26989.0 | -7806 | 2560 |
| pi | cache-select | inventory-reservations | 0 | true | 0 | 0 | -0.026052 | -7336.0 | -7703 | 4096 |
| pi | compact | inventory-reservations | 0 | false | -1 | unknown | unknown | 10629.0 | 7403 | -768 |
| pi | core | inventory-reservations | 0 | true | 0 | 0 | -0.015545 | -18640.0 | -7831 | -1792 |
| pi | default-code | inventory-reservations | 0 | true | 0 | 0 | -0.012643 | -19794.0 | -6447 | -1408 |
| pi | delegate | inventory-reservations | 0 | true | 0 | 0 | -0.016894 | 13514.0 | -4031 | 4480 |
| pi | graph | inventory-reservations | 0 | true | 0 | 0 | -0.024291 | -26110.0 | -6751 | 3712 |
| pi | luna-worker | inventory-reservations | 0 | true | 0 | 0 | -0.042981 | -28308.0 | 3300 | 11520 |
| pi | luna | inventory-reservations | 0 | true | 0 | 0 | -0.021707 | 2139.0 | -876 | 3712 |
| pi | route | inventory-reservations | 0 | true | 0 | 0 | -0.010994 | -17040.0 | -5709 | -2816 |
| pi | select-gemma | inventory-reservations | 0 | false | 0 | unknown | unknown | -17477.0 | unknown | 1536 |
| pi | select-jev | inventory-reservations | 0 | false | -1 | unknown | unknown | 98841.0 | 84508 | 17664 |
| pi | select-lightning | inventory-reservations | 0 | false | -1 | unknown | unknown | 15751.0 | 17709 | -768 |
| pi | select-luna | inventory-reservations | 0 | false | -1 | unknown | unknown | 127427.0 | 77105 | 12416 |
| pi | select-nemotron | inventory-reservations | 0 | false | -1 | unknown | unknown | 63002.0 | 22906 | 5376 |
| pi | select-rules | inventory-reservations | 0 | false | -1 | unknown | unknown | 9795.0 | 9395 | -1792 |
| pi | short-direct | inventory-reservations | 0 | true | 0 | 0 | -0.001926 | -3264.0 | -3286 | -2816 |

Frozen manifest SHA-256: `98c45cd4e603a32156ac911f79531b84944342b268b8cb52623ba9a4d50963a5`.

Local evidence links point to ignored run files on this machine; raw run output is not embedded in this report.

- [001-inventory-reservations-pi-r0](../.suffice/runs/context-screen-v4/001-inventory-reservations-pi-r0/result.json)
- [002-inventory-reservations-core-r0](../.suffice/runs/context-screen-v4/002-inventory-reservations-core-r0/result.json)
- [003-inventory-reservations-luna-r0](../.suffice/runs/context-screen-v4/003-inventory-reservations-luna-r0/result.json)
- [004-inventory-reservations-short-direct-r0](../.suffice/runs/context-screen-v4/004-inventory-reservations-short-direct-r0/result.json)
- [005-inventory-reservations-default-code-r0](../.suffice/runs/context-screen-v4/005-inventory-reservations-default-code-r0/result.json)
- [006-inventory-reservations-bounded-r0](../.suffice/runs/context-screen-v4/006-inventory-reservations-bounded-r0/result.json)
- [007-inventory-reservations-select-rules-r0](../.suffice/runs/context-screen-v4/007-inventory-reservations-select-rules-r0/result.json)
- [008-inventory-reservations-select-luna-r0](../.suffice/runs/context-screen-v4/008-inventory-reservations-select-luna-r0/result.json)
- [009-inventory-reservations-select-jev-r0](../.suffice/runs/context-screen-v4/009-inventory-reservations-select-jev-r0/result.json)
- [010-inventory-reservations-select-gemma-r0](../.suffice/runs/context-screen-v4/010-inventory-reservations-select-gemma-r0/result.json)
- [011-inventory-reservations-select-lightning-r0](../.suffice/runs/context-screen-v4/011-inventory-reservations-select-lightning-r0/result.json)
- [012-inventory-reservations-select-nemotron-r0](../.suffice/runs/context-screen-v4/012-inventory-reservations-select-nemotron-r0/result.json)
- [013-inventory-reservations-compact-r0](../.suffice/runs/context-screen-v4/013-inventory-reservations-compact-r0/result.json)
- [014-inventory-reservations-cache-select-r0](../.suffice/runs/context-screen-v4/014-inventory-reservations-cache-select-r0/result.json)
- [015-inventory-reservations-graph-r0](../.suffice/runs/context-screen-v4/015-inventory-reservations-graph-r0/result.json)
- [016-inventory-reservations-delegate-r0](../.suffice/runs/context-screen-v4/016-inventory-reservations-delegate-r0/result.json)
- [017-inventory-reservations-luna-worker-r0](../.suffice/runs/context-screen-v4/017-inventory-reservations-luna-worker-r0/result.json)
- [018-inventory-reservations-route-r0](../.suffice/runs/context-screen-v4/018-inventory-reservations-route-r0/result.json)

- Descriptive pilot only; small samples do not establish significance or real-world performance.
- Core versus Pi compares a prompt/tool bundle; watcher versus core compares an added observer.
- Intention-to-treat operational success includes scheduled missing results and provider/watcher failures. Missing results are incomplete executions, not evidence of model inability.
- Treated-valid efficacy excludes unavailable acceptance, main failure, missing cost telemetry, watcher errors, and missing decision records. This selected subset is descriptive and can be biased.
- Costs are API-equivalent estimates for subscription models plus estimated external watcher spend, not an actual subscription bill or verified provider invoice.
- Known cost includes failed attempts and known components of partially costed runs. Incomplete cost/success is a nonnegative lower bound; null never means zero.
- Jev ledger reservations are conservative budget consumption, separate from usage-based estimated spend; global reservations cannot be attributed to a campaign.
- Provider cache warmth was observed rather than controlled. Fixed task/repetition pairs do not remove order or availability effects.
