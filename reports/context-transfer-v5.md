# Campaign context-transfer-v5

AI-authored synthetic context tasks. Descriptive results; no significance claim.

Main model: variant-specific: gpt-6.1-sol or gpt-6-luna; reasoning effort: low. Compare arms within this campaign; do not pool different effort settings.

Means show known telemetry coverage in parentheses. Subscription costs are API-equivalent estimates, not billed subscription spend. Total estimated cost also includes watcher estimates. Unknown costs are not zero.

| Variant | Recorded / scheduled | ITT success | Treated-valid success | Main API-equivalent mean $ | Total estimated mean $ | Mean latency ms | Mean total tokens | Mean cache reads | Mean watcher calls | Mean injections | Mean watcher errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cache-select | 4/4 | 4/4 | 4/4 | 0.021853 (4/4) | 0.021853 (4/4) | 46871.8 (4/4) | 14064.3 (4/4) | 6080.0 (4/4) | 0.0 (4/4) | 0.0 (4/4) | 0.0 (4/4) |
| core | 4/4 | 4/4 | 3/3 | 0.026473 (3/4) | 0.026473 (3/4) | 44420.0 (4/4) | 13916.5 (4/4) | 3776.0 (4/4) | 0.0 (4/4) | 0.0 (4/4) | 0.0 (4/4) |
| delegate | 4/4 | 4/4 | 3/3 | 0.024308 (3/4) | 0.031922 (3/4) | 48019.0 (4/4) | 16386.8 (4/4) | 5280.0 (4/4) | 1.5 (4/4) | 1.5 (4/4) | 0.0 (4/4) |
| graph | 4/4 | 4/4 | 4/4 | 0.025590 (4/4) | 0.025590 (4/4) | 37040.8 (4/4) | 14730.0 (4/4) | 4480.0 (4/4) | 3.3 (4/4) | 3.3 (4/4) | 0.0 (4/4) |
| luna-worker | 4/4 | 3/4 | 3/4 | 0.001584 (4/4) | 0.001584 (4/4) | 32632.5 (4/4) | 23600.5 (4/4) | 11648.0 (4/4) | 0.0 (4/4) | 0.0 (4/4) | 0.0 (4/4) |
| route | 4/4 | 4/4 | 4/4 | 0.022541 (4/4) | 0.022541 (4/4) | 45495.5 (4/4) | 16480.5 (4/4) | 6944.0 (4/4) | 0.0 (4/4) | 0.0 (4/4) | 0.0 (4/4) |
| stable-jev | 4/4 | 4/4 | 4/4 | 0.023087 (4/4) | 0.023087 (4/4) | 33917.8 (4/4) | 13892.5 (4/4) | 4896.0 (4/4) | 0.0 (4/4) | 0.0 (4/4) | 0.0 (4/4) |
| stable-luna | 4/4 | 4/4 | 4/4 | 0.023981 (4/4) | 0.023981 (4/4) | 36809.8 (4/4) | 14020.0 (4/4) | 4768.0 (4/4) | 0.0 (4/4) | 0.0 (4/4) | 0.0 (4/4) |
| stable-rules | 4/4 | 4/4 | 4/4 | 0.020724 (4/4) | 0.020724 (4/4) | 38262.3 (4/4) | 13960.3 (4/4) | 6240.0 (4/4) | 0.0 (4/4) | 0.0 (4/4) | 0.0 (4/4) |

Costs per operational success include all known attempted-run costs, including unsuccessful runs. A partial lower bound is shown separately from a fully covered ratio.

| Variant | Known cost components $ | Complete cost coverage | Cost / success $ | Known cost / success lower bound $ | Status counts | Valid-subset exclusions | Watcher error codes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| cache-select | 0.087410 | 4/4 | 0.021853 | 0.021853 | completed: 4 | none | none |
| core | 0.101898 | 3/4 | unknown | 0.025475 | completed: 4 | main_cost_unknown: 1 | none |
| delegate | 0.114494 | 3/4 | unknown | 0.028623 | completed: 4 | main_cost_unknown: 1 | none |
| graph | 0.102360 | 4/4 | 0.025590 | 0.025590 | completed: 4 | none | none |
| luna-worker | 0.006336 | 4/4 | 0.002112 | 0.002112 | completed: 4 | none | none |
| route | 0.090162 | 4/4 | 0.022541 | 0.022541 | completed: 4 | none | none |
| stable-jev | 0.092346 | 4/4 | 0.023087 | 0.023087 | completed: 4 | none | none |
| stable-luna | 0.095923 | 4/4 | 0.023981 | 0.023981 | completed: 4 | none | none |
| stable-rules | 0.082898 | 4/4 | 0.020724 | 0.020724 | completed: 4 | none | none |

Intervention rates describe availability: a valid watcher arm may have no eligible source-read event. A watcher error remains an operational outcome even when the main agent succeeds.

| Variant | Runs with watcher calls | Runs with injection / recorded | Injection rate among eligible runs |
| --- | --- | --- | --- |
| cache-select | 0 | 0/4 | unknown |
| core | 0 | 0/4 | unknown |
| delegate | 3 | 3/4 | 1.000 |
| graph | 4 | 4/4 | 1.000 |
| luna-worker | 0 | 0/4 | unknown |
| route | 0 | 0/4 | unknown |
| stable-jev | 0 | 0/4 | unknown |
| stable-luna | 0 | 0/4 | unknown |
| stable-rules | 0 | 0/4 | unknown |

Jev usage-based estimates and global ledger reserves are separate. Estimates require returned input usage after dispatch; the $0.01 reservation on a failed request is not measured spend. Explicitly undispatched preflight failures have zero inference spend.

| Variant | Jev known estimated spend $ | Known / unknown Jev calls | Recorded reservations $ (coverage) |
| --- | --- | --- | --- |

Global Jev ledger: $0.14 reserved of $2.00, 14 reservations. This spans campaigns and is not campaign-attributed spend.

Paired differences are variant minus baseline on the same task and repetition. Operational success differences include failures; valid efficacy differences require both arms to be valid. Positive cost/latency differences mean greater resource use.

| Baseline | Variant | Task | Repetition | Valid pair | ITT success delta | Valid success delta | Estimated $ delta | Latency ms delta | Total token delta | Cache-read delta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| core | cache-select | layered-routing | 0 | false | 0 | unknown | unknown | -5721.0 | 305 | -3584 |
| core | cache-select | layered-routing | 1 | true | 0 | 0 | -0.008903 | 18032.0 | 339 | 5632 |
| core | cache-select | tenant-event-feed | 0 | true | 0 | 0 | -0.013445 | 3548.0 | 31 | 7168 |
| core | cache-select | tenant-event-feed | 1 | true | 0 | 0 | -0.000504 | -6052.0 | -84 | 0 |
| core | delegate | layered-routing | 0 | false | 0 | unknown | unknown | -6734.0 | 3163 | -4608 |
| core | delegate | layered-routing | 1 | true | 0 | 0 | 0.000294 | 19500.0 | 3548 | 4864 |
| core | delegate | tenant-event-feed | 0 | false | 0 | unknown | unknown | 14279.0 | 245 | 7168 |
| core | delegate | tenant-event-feed | 1 | true | 0 | 0 | 0.008333 | -12649.0 | 2925 | -1408 |
| core | graph | layered-routing | 0 | false | 0 | unknown | unknown | -7821.0 | 1240 | 1664 |
| core | graph | layered-routing | 1 | true | 0 | 0 | -0.007489 | 2817.0 | 1297 | 5248 |
| core | graph | tenant-event-feed | 0 | true | 0 | 0 | -0.000166 | -9093.0 | 1380 | 1536 |
| core | graph | tenant-event-feed | 1 | true | 0 | 0 | 0.009039 | -15420.0 | -663 | -5632 |
| core | luna-worker | layered-routing | 0 | false | 0 | unknown | unknown | -33473.0 | 7268 | 4480 |
| core | luna-worker | layered-routing | 1 | true | 0 | 0 | -0.027755 | 435.0 | 9652 | 6528 |
| core | luna-worker | tenant-event-feed | 0 | true | 0 | 0 | -0.029776 | -6227.0 | 4668 | 8192 |
| core | luna-worker | tenant-event-feed | 1 | true | -1 | -1 | -0.016982 | -7885.0 | 17148 | 12288 |
| core | route | layered-routing | 0 | false | 0 | unknown | unknown | -11350.0 | 1796 | 1408 |
| core | route | layered-routing | 1 | true | 0 | 0 | -0.001600 | 2158.0 | -10 | 0 |
| core | route | tenant-event-feed | 0 | true | 0 | 0 | -0.013913 | 12705.0 | 964 | 7168 |
| core | route | tenant-event-feed | 1 | true | 0 | 0 | 0.005196 | 789.0 | 7506 | 4096 |
| core | stable-jev | layered-routing | 0 | false | 0 | unknown | unknown | -20920.0 | -333 | 1024 |
| core | stable-jev | layered-routing | 1 | true | 0 | 0 | -0.007333 | 250.0 | 43 | 3968 |
| core | stable-jev | tenant-event-feed | 0 | true | 0 | 0 | -0.010443 | -5757.0 | 109 | 5632 |
| core | stable-jev | tenant-event-feed | 1 | true | 0 | 0 | 0.011796 | -15582.0 | 85 | -6144 |
| core | stable-luna | layered-routing | 0 | false | 0 | unknown | unknown | -6356.0 | -8 | 1024 |
| core | stable-luna | layered-routing | 1 | true | 0 | 0 | -0.004000 | 1632.0 | 357 | 2944 |
| core | stable-luna | tenant-event-feed | 0 | true | 0 | 0 | -0.007479 | -4862.0 | 254 | 4608 |
| core | stable-luna | tenant-event-feed | 1 | true | 0 | 0 | 0.007537 | -20855.0 | -189 | -4608 |
| core | stable-rules | layered-routing | 0 | false | 0 | unknown | unknown | -12510.0 | -323 | 0 |
| core | stable-rules | layered-routing | 1 | true | 0 | 0 | -0.008903 | 15022.0 | 387 | 5632 |
| core | stable-rules | tenant-event-feed | 0 | true | 0 | 0 | -0.011103 | -8008.0 | -101 | 5632 |
| core | stable-rules | tenant-event-feed | 1 | true | 0 | 0 | 0.002563 | -19135.0 | 212 | -1408 |

Frozen manifest SHA-256: `279bb15c7e186bd959c2af6143eaa10435d8045e39558737050cf38c92d6ad7c`.

Local evidence links point to ignored run files on this machine; raw run output is not embedded in this report.

- [001-tenant-event-feed-core-r0](../.suffice/runs/context-transfer-v5/001-tenant-event-feed-core-r0/result.json)
- [002-tenant-event-feed-cache-select-r0](../.suffice/runs/context-transfer-v5/002-tenant-event-feed-cache-select-r0/result.json)
- [003-tenant-event-feed-graph-r0](../.suffice/runs/context-transfer-v5/003-tenant-event-feed-graph-r0/result.json)
- [004-tenant-event-feed-delegate-r0](../.suffice/runs/context-transfer-v5/004-tenant-event-feed-delegate-r0/result.json)
- [005-tenant-event-feed-luna-worker-r0](../.suffice/runs/context-transfer-v5/005-tenant-event-feed-luna-worker-r0/result.json)
- [006-tenant-event-feed-route-r0](../.suffice/runs/context-transfer-v5/006-tenant-event-feed-route-r0/result.json)
- [007-tenant-event-feed-stable-rules-r0](../.suffice/runs/context-transfer-v5/007-tenant-event-feed-stable-rules-r0/result.json)
- [008-tenant-event-feed-stable-luna-r0](../.suffice/runs/context-transfer-v5/008-tenant-event-feed-stable-luna-r0/result.json)
- [009-tenant-event-feed-stable-jev-r0](../.suffice/runs/context-transfer-v5/009-tenant-event-feed-stable-jev-r0/result.json)
- [010-layered-routing-cache-select-r0](../.suffice/runs/context-transfer-v5/010-layered-routing-cache-select-r0/result.json)
- [011-layered-routing-graph-r0](../.suffice/runs/context-transfer-v5/011-layered-routing-graph-r0/result.json)
- [012-layered-routing-delegate-r0](../.suffice/runs/context-transfer-v5/012-layered-routing-delegate-r0/result.json)
- [013-layered-routing-luna-worker-r0](../.suffice/runs/context-transfer-v5/013-layered-routing-luna-worker-r0/result.json)
- [014-layered-routing-route-r0](../.suffice/runs/context-transfer-v5/014-layered-routing-route-r0/result.json)
- [015-layered-routing-stable-rules-r0](../.suffice/runs/context-transfer-v5/015-layered-routing-stable-rules-r0/result.json)
- [016-layered-routing-stable-luna-r0](../.suffice/runs/context-transfer-v5/016-layered-routing-stable-luna-r0/result.json)
- [017-layered-routing-stable-jev-r0](../.suffice/runs/context-transfer-v5/017-layered-routing-stable-jev-r0/result.json)
- [018-layered-routing-core-r0](../.suffice/runs/context-transfer-v5/018-layered-routing-core-r0/result.json)
- [019-tenant-event-feed-graph-r1](../.suffice/runs/context-transfer-v5/019-tenant-event-feed-graph-r1/result.json)
- [020-tenant-event-feed-cache-select-r1](../.suffice/runs/context-transfer-v5/020-tenant-event-feed-cache-select-r1/result.json)
- [021-tenant-event-feed-core-r1](../.suffice/runs/context-transfer-v5/021-tenant-event-feed-core-r1/result.json)
- [022-tenant-event-feed-stable-jev-r1](../.suffice/runs/context-transfer-v5/022-tenant-event-feed-stable-jev-r1/result.json)
- [023-tenant-event-feed-stable-luna-r1](../.suffice/runs/context-transfer-v5/023-tenant-event-feed-stable-luna-r1/result.json)
- [024-tenant-event-feed-stable-rules-r1](../.suffice/runs/context-transfer-v5/024-tenant-event-feed-stable-rules-r1/result.json)
- [025-tenant-event-feed-route-r1](../.suffice/runs/context-transfer-v5/025-tenant-event-feed-route-r1/result.json)
- [026-tenant-event-feed-luna-worker-r1](../.suffice/runs/context-transfer-v5/026-tenant-event-feed-luna-worker-r1/result.json)
- [027-tenant-event-feed-delegate-r1](../.suffice/runs/context-transfer-v5/027-tenant-event-feed-delegate-r1/result.json)
- [028-layered-routing-delegate-r1](../.suffice/runs/context-transfer-v5/028-layered-routing-delegate-r1/result.json)
- [029-layered-routing-graph-r1](../.suffice/runs/context-transfer-v5/029-layered-routing-graph-r1/result.json)
- [030-layered-routing-cache-select-r1](../.suffice/runs/context-transfer-v5/030-layered-routing-cache-select-r1/result.json)
- [031-layered-routing-core-r1](../.suffice/runs/context-transfer-v5/031-layered-routing-core-r1/result.json)
- [032-layered-routing-stable-jev-r1](../.suffice/runs/context-transfer-v5/032-layered-routing-stable-jev-r1/result.json)
- [033-layered-routing-stable-luna-r1](../.suffice/runs/context-transfer-v5/033-layered-routing-stable-luna-r1/result.json)
- [034-layered-routing-stable-rules-r1](../.suffice/runs/context-transfer-v5/034-layered-routing-stable-rules-r1/result.json)
- [035-layered-routing-route-r1](../.suffice/runs/context-transfer-v5/035-layered-routing-route-r1/result.json)
- [036-layered-routing-luna-worker-r1](../.suffice/runs/context-transfer-v5/036-layered-routing-luna-worker-r1/result.json)

- Descriptive pilot only; small samples do not establish significance or real-world performance.
- Core versus Pi compares a prompt/tool bundle; watcher versus core compares an added observer.
- Intention-to-treat operational success includes scheduled missing results and provider/watcher failures. Missing results are incomplete executions, not evidence of model inability.
- Treated-valid efficacy excludes unavailable acceptance, main failure, missing cost telemetry, watcher errors, and missing decision records. This selected subset is descriptive and can be biased.
- Costs are API-equivalent estimates for subscription models plus estimated external watcher spend, not an actual subscription bill or verified provider invoice.
- Known cost includes failed attempts and known components of partially costed runs. Incomplete cost/success is a nonnegative lower bound; null never means zero.
- Jev ledger reservations are conservative budget consumption, separate from usage-based estimated spend; global reservations cannot be attributed to a campaign.
- Provider cache warmth was observed rather than controlled. Fixed task/repetition pairs do not remove order or availability effects.
