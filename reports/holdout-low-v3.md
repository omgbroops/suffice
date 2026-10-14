# Campaign holdout-low-v3

AI-authored synthetic holdout tasks. Descriptive results; no significance claim.

Main model: gpt-6.1-sol; reasoning effort: low. Compare arms within this campaign; do not pool different effort settings.

Means show known telemetry coverage in parentheses. Subscription costs are API-equivalent estimates, not billed subscription spend. Total estimated cost also includes watcher estimates. Unknown costs are not zero.

| Variant | Recorded / scheduled | ITT success | Treated-valid success | Main API-equivalent mean $ | Total estimated mean $ | Mean latency ms | Mean total tokens | Mean cache reads | Mean watcher calls | Mean injections | Mean watcher errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| core | 4/4 | 4/4 | 4/4 | 0.015988 (4/4) | 0.015988 (4/4) | 34736.8 (4/4) | 8090.8 (4/4) | 2208.0 (4/4) | 0.0 (4/4) | 0.0 (4/4) | 0.0 (4/4) |
| jev | 4/4 | 4/4 | 3/3 | 0.018839 (3/4) | 0.018887 (3/4) | 35634.8 (4/4) | 9734.3 (4/4) | 1856.0 (4/4) | 1.0 (4/4) | 1.0 (4/4) | 0.0 (4/4) |
| jev-gated | 4/4 | 4/4 | 4/4 | 0.019126 (4/4) | 0.019126 (4/4) | 29921.8 (4/4) | 8095.8 (4/4) | 544.0 (4/4) | 0.0 (4/4) | 0.0 (4/4) | 0.0 (4/4) |
| pi | 4/4 | 4/4 | 4/4 | 0.024211 (4/4) | 0.024211 (4/4) | 53992.8 (4/4) | 12736.3 (4/4) | 3840.0 (4/4) | 0.0 (4/4) | 0.0 (4/4) | 0.0 (4/4) |

Costs per operational success include all known attempted-run costs, including unsuccessful runs. A partial lower bound is shown separately from a fully covered ratio.

| Variant | Known cost components $ | Complete cost coverage | Cost / success $ | Known cost / success lower bound $ | Status counts | Valid-subset exclusions | Watcher error codes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| core | 0.063953 | 4/4 | 0.015988 | 0.015988 | completed: 4 | none | none |
| jev | 0.056709 | 3/4 | unknown | 0.014177 | completed: 4 | main_cost_unknown: 1 | none |
| jev-gated | 0.076504 | 4/4 | 0.019126 | 0.019126 | completed: 4 | none | none |
| pi | 0.096842 | 4/4 | 0.024211 | 0.024211 | completed: 4 | none | none |

Intervention rates describe availability: a valid watcher arm may have no eligible source-read event. A watcher error remains an operational outcome even when the main agent succeeds.

| Variant | Runs with watcher calls | Runs with injection / recorded | Injection rate among eligible runs |
| --- | --- | --- | --- |
| core | 0 | 0/4 | unknown |
| jev | 4 | 4/4 | 1.000 |
| jev-gated | 0 | 0/4 | unknown |
| pi | 0 | 0/4 | unknown |

Jev usage-based estimates and global ledger reserves are separate. Estimates require returned input usage after dispatch; the $0.01 reservation on a failed request is not measured spend. Explicitly undispatched preflight failures have zero inference spend.

| Variant | Jev known estimated spend $ | Known / unknown Jev calls | Recorded reservations $ (coverage) |
| --- | --- | --- | --- |
| jev | 0.000193 | 4/0 | 0.04 (4/4) |

Global Jev ledger: $0.10 reserved of $2.00, 10 reservations. This spans campaigns and is not campaign-attributed spend.

Paired differences are variant minus baseline on the same task and repetition. Operational success differences include failures; valid efficacy differences require both arms to be valid. Positive cost/latency differences mean greater resource use.

| Baseline | Variant | Task | Repetition | Valid pair | ITT success delta | Valid success delta | Estimated $ delta | Latency ms delta | Total token delta | Cache-read delta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| core | jev-gated | atomic-ledger | 0 | true | 0 | 0 | 0.001823 | -9717.0 | -126 | -1408 |
| core | jev-gated | dependency-aliases | 0 | true | 0 | 0 | 0.005826 | -12200.0 | -31 | -3200 |
| core | jev-gated | layered-config | 0 | true | 0 | 0 | 0.000888 | 2126.0 | 152 | 0 |
| core | jev-gated | streaming-utf8 | 0 | true | 0 | 0 | 0.004013 | 531.0 | 25 | -2048 |
| core | jev | atomic-ledger | 0 | true | 0 | 0 | 0.004681 | -4137.0 | 1728 | -2176 |
| core | jev | dependency-aliases | 0 | true | 0 | 0 | 0.005974 | -10298.0 | 1368 | -3200 |
| core | jev | layered-config | 0 | true | 0 | 0 | -0.003428 | -4095.0 | 1493 | 2176 |
| core | jev | streaming-utf8 | 0 | false | 0 | unknown | unknown | 22122.0 | 1985 | 1792 |
| core | pi | atomic-ledger | 0 | true | 0 | 0 | 0.007944 | 17959.0 | 4003 | 896 |
| core | pi | dependency-aliases | 0 | true | 0 | 0 | 0.011805 | -2705.0 | 4676 | -1152 |
| core | pi | layered-config | 0 | true | 0 | 0 | 0.005228 | 30157.0 | 2753 | 2816 |
| core | pi | streaming-utf8 | 0 | true | 0 | 0 | 0.007913 | 31613.0 | 7150 | 3968 |
| pi | core | atomic-ledger | 0 | true | 0 | 0 | -0.007944 | -17959.0 | -4003 | -896 |
| pi | core | dependency-aliases | 0 | true | 0 | 0 | -0.011805 | 2705.0 | -4676 | 1152 |
| pi | core | layered-config | 0 | true | 0 | 0 | -0.005228 | -30157.0 | -2753 | -2816 |
| pi | core | streaming-utf8 | 0 | true | 0 | 0 | -0.007913 | -31613.0 | -7150 | -3968 |
| pi | jev-gated | atomic-ledger | 0 | true | 0 | 0 | -0.006120 | -27676.0 | -4129 | -2304 |
| pi | jev-gated | dependency-aliases | 0 | true | 0 | 0 | -0.005979 | -9495.0 | -4707 | -2048 |
| pi | jev-gated | layered-config | 0 | true | 0 | 0 | -0.004340 | -28031.0 | -2601 | -2816 |
| pi | jev-gated | streaming-utf8 | 0 | true | 0 | 0 | -0.003900 | -31082.0 | -7125 | -6016 |
| pi | jev | atomic-ledger | 0 | true | 0 | 0 | -0.003262 | -22096.0 | -2275 | -3072 |
| pi | jev | dependency-aliases | 0 | true | 0 | 0 | -0.005830 | -7593.0 | -3308 | -2048 |
| pi | jev | layered-config | 0 | true | 0 | 0 | -0.008656 | -34252.0 | -1260 | -640 |
| pi | jev | streaming-utf8 | 0 | false | 0 | unknown | unknown | -9491.0 | -5165 | -2176 |

Frozen manifest SHA-256: `c7338ea2f97dca01a51f46bd0b1188bcd8674b21e4ac66f4638c4929ffdb71c1`.

Local evidence links point to ignored run files on this machine; raw run output is not embedded in this report.

- [001-streaming-utf8-pi-r0](../.suffice/runs/holdout-low-v3/001-streaming-utf8-pi-r0/result.json)
- [002-streaming-utf8-core-r0](../.suffice/runs/holdout-low-v3/002-streaming-utf8-core-r0/result.json)
- [003-streaming-utf8-jev-r0](../.suffice/runs/holdout-low-v3/003-streaming-utf8-jev-r0/result.json)
- [004-streaming-utf8-jev-gated-r0](../.suffice/runs/holdout-low-v3/004-streaming-utf8-jev-gated-r0/result.json)
- [005-dependency-aliases-core-r0](../.suffice/runs/holdout-low-v3/005-dependency-aliases-core-r0/result.json)
- [006-dependency-aliases-jev-r0](../.suffice/runs/holdout-low-v3/006-dependency-aliases-jev-r0/result.json)
- [007-dependency-aliases-jev-gated-r0](../.suffice/runs/holdout-low-v3/007-dependency-aliases-jev-gated-r0/result.json)
- [008-dependency-aliases-pi-r0](../.suffice/runs/holdout-low-v3/008-dependency-aliases-pi-r0/result.json)
- [009-layered-config-jev-r0](../.suffice/runs/holdout-low-v3/009-layered-config-jev-r0/result.json)
- [010-layered-config-jev-gated-r0](../.suffice/runs/holdout-low-v3/010-layered-config-jev-gated-r0/result.json)
- [011-layered-config-pi-r0](../.suffice/runs/holdout-low-v3/011-layered-config-pi-r0/result.json)
- [012-layered-config-core-r0](../.suffice/runs/holdout-low-v3/012-layered-config-core-r0/result.json)
- [013-atomic-ledger-jev-gated-r0](../.suffice/runs/holdout-low-v3/013-atomic-ledger-jev-gated-r0/result.json)
- [014-atomic-ledger-pi-r0](../.suffice/runs/holdout-low-v3/014-atomic-ledger-pi-r0/result.json)
- [015-atomic-ledger-core-r0](../.suffice/runs/holdout-low-v3/015-atomic-ledger-core-r0/result.json)
- [016-atomic-ledger-jev-r0](../.suffice/runs/holdout-low-v3/016-atomic-ledger-jev-r0/result.json)

- Descriptive pilot only; small samples do not establish significance or real-world performance.
- Core versus Pi compares a prompt/tool bundle; watcher versus core compares an added observer.
- Intention-to-treat operational success includes scheduled missing results and provider/watcher failures. Missing results are incomplete executions, not evidence of model inability.
- Treated-valid efficacy excludes unavailable acceptance, main failure, missing cost telemetry, watcher errors, and missing decision records. This selected subset is descriptive and can be biased.
- Costs are API-equivalent estimates for subscription models plus estimated external watcher spend, not an actual subscription bill or verified provider invoice.
- Known cost includes failed attempts and known components of partially costed runs. Incomplete cost/success is a nonnegative lower bound; null never means zero.
- Jev ledger reservations are conservative budget consumption, separate from usage-based estimated spend; global reservations cannot be attributed to a campaign.
- Provider cache warmth was observed rather than controlled. Fixed task/repetition pairs do not remove order or availability effects.
