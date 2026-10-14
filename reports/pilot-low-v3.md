# Campaign pilot-low-v3

AI-authored synthetic pilot tasks. Descriptive results; no significance claim.

Main model: gpt-6.1-sol; reasoning effort: low. Compare arms within this campaign; do not pool different effort settings.

Means show known telemetry coverage in parentheses. Subscription costs are API-equivalent estimates, not billed subscription spend. Total estimated cost also includes watcher estimates. Unknown costs are not zero.

| Variant | Recorded / scheduled | ITT success | Treated-valid success | Main API-equivalent mean $ | Total estimated mean $ | Mean latency ms | Mean total tokens | Mean cache reads | Mean watcher calls | Mean injections | Mean watcher errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| core | 4/4 | 4/4 | 4/4 | 0.015156 (4/4) | 0.015156 (4/4) | 31620.8 (4/4) | 7973.0 (4/4) | 2240.0 (4/4) | 0.0 (4/4) | 0.0 (4/4) | 0.0 (4/4) |
| jev | 4/4 | 3/4 | 2/2 | 0.012423 (2/4) | 0.012471 (2/4) | 30531.5 (4/4) | 7058.3 (4/4) | 2688.0 (4/4) | 0.8 (4/4) | 0.8 (4/4) | 0.0 (4/4) |
| jev-gated | 4/4 | 4/4 | 4/4 | 0.014724 (4/4) | 0.014724 (4/4) | 32325.3 (4/4) | 7999.5 (4/4) | 2528.0 (4/4) | 0.0 (4/4) | 0.0 (4/4) | 0.0 (4/4) |
| lightning | 4/4 | 4/4 | 4/4 | 0.015543 (4/4) | 0.015543 (4/4) | 34285.5 (4/4) | 9141.3 (4/4) | 2432.0 (4/4) | 1.0 (4/4) | 1.0 (4/4) | 0.0 (4/4) |
| luna | 4/4 | 3/4 | 3/3 | 0.012838 (3/4) | 0.012939 (3/4) | 28889.8 (4/4) | 6628.3 (4/4) | 2304.0 (4/4) | 0.8 (4/4) | 0.8 (4/4) | 0.0 (4/4) |
| nemotron | 4/4 | 4/4 | 4/4 | 0.016722 (4/4) | 0.016722 (4/4) | 32092.5 (4/4) | 9077.5 (4/4) | 1728.0 (4/4) | 1.0 (4/4) | 0.8 (4/4) | 0.0 (4/4) |
| pi | 4/4 | 4/4 | 4/4 | 0.021517 (4/4) | 0.021517 (4/4) | 40075.5 (4/4) | 11374.8 (4/4) | 2912.0 (4/4) | 0.0 (4/4) | 0.0 (4/4) | 0.0 (4/4) |
| rules | 4/4 | 3/4 | 3/3 | 0.014767 (3/4) | 0.014767 (3/4) | 25874.5 (4/4) | 5801.5 (4/4) | 1344.0 (4/4) | 0.8 (4/4) | 0.0 (4/4) | 0.0 (4/4) |

Costs per operational success include all known attempted-run costs, including unsuccessful runs. A partial lower bound is shown separately from a fully covered ratio.

| Variant | Known cost components $ | Complete cost coverage | Cost / success $ | Known cost / success lower bound $ | Status counts | Valid-subset exclusions | Watcher error codes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| core | 0.060624 | 4/4 | 0.015156 | 0.015156 | completed: 4 | none | none |
| jev | 0.024988 | 2/4 | unknown | 0.008329 | provider_error: 1, completed: 3 | main_not_completed: 1, main_cost_unknown: 2 | none |
| jev-gated | 0.058895 | 4/4 | 0.014724 | 0.014724 | completed: 4 | none | none |
| lightning | 0.062171 | 4/4 | 0.015543 | 0.015543 | completed: 4 | none | none |
| luna | 0.038818 | 3/4 | unknown | 0.012939 | provider_error: 1, completed: 3 | main_not_completed: 1, main_cost_unknown: 1 | none |
| nemotron | 0.066887 | 4/4 | 0.016722 | 0.016722 | completed: 4 | none | none |
| pi | 0.086067 | 4/4 | 0.021517 | 0.021517 | completed: 4 | none | none |
| rules | 0.044302 | 3/4 | unknown | 0.014767 | provider_error: 1, completed: 3 | main_not_completed: 1, main_cost_unknown: 1 | none |

Intervention rates describe availability: a valid watcher arm may have no eligible source-read event. A watcher error remains an operational outcome even when the main agent succeeds.

| Variant | Runs with watcher calls | Runs with injection / recorded | Injection rate among eligible runs |
| --- | --- | --- | --- |
| core | 0 | 0/4 | unknown |
| jev | 3 | 3/4 | 1.000 |
| jev-gated | 0 | 0/4 | unknown |
| lightning | 4 | 4/4 | 1.000 |
| luna | 3 | 3/4 | 1.000 |
| nemotron | 4 | 3/4 | 0.750 |
| pi | 0 | 0/4 | unknown |
| rules | 3 | 0/4 | 0.000 |

Jev usage-based estimates and global ledger reserves are separate. Estimates require returned input usage after dispatch; the $0.01 reservation on a failed request is not measured spend. Explicitly undispatched preflight failures have zero inference spend.

| Variant | Jev known estimated spend $ | Known / unknown Jev calls | Recorded reservations $ (coverage) |
| --- | --- | --- | --- |
| jev | 0.000142 | 3/0 | 0.03 (3/3) |

Global Jev ledger: $0.10 reserved of $2.00, 10 reservations. This spans campaigns and is not campaign-attributed spend.

Paired differences are variant minus baseline on the same task and repetition. Operational success differences include failures; valid efficacy differences require both arms to be valid. Positive cost/latency differences mean greater resource use.

| Baseline | Variant | Task | Repetition | Valid pair | ITT success delta | Valid success delta | Estimated $ delta | Latency ms delta | Total token delta | Cache-read delta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| core | jev-gated | cursor-pagination | 0 | true | 0 | 0 | -0.003072 | 4031.0 | -96 | 1280 |
| core | jev-gated | retry-idempotency | 0 | true | 0 | 0 | 0.005180 | 3627.0 | 179 | -2176 |
| core | jev-gated | tenant-cache | 0 | true | 0 | 0 | 0.000064 | -3134.0 | 16 | 0 |
| core | jev-gated | window-scheduler | 0 | true | 0 | 0 | -0.003901 | -1706.0 | 7 | 2048 |
| core | jev | cursor-pagination | 0 | true | 0 | 0 | -0.001595 | -3359.0 | 1877 | 1664 |
| core | jev | retry-idempotency | 0 | false | -1 | unknown | unknown | -20489.0 | -8616 | -3584 |
| core | jev | tenant-cache | 0 | true | 0 | 0 | -0.001453 | 5077.0 | 1653 | 1536 |
| core | jev | window-scheduler | 0 | false | 0 | unknown | unknown | 14414.0 | 1427 | 2176 |
| core | lightning | cursor-pagination | 0 | true | 0 | 0 | 0.002099 | -1698.0 | 1120 | -768 |
| core | lightning | retry-idempotency | 0 | true | 0 | 0 | 0.000801 | 14828.0 | 1252 | 128 |
| core | lightning | tenant-cache | 0 | true | 0 | 0 | 0.002235 | -2383.0 | 1183 | -768 |
| core | lightning | window-scheduler | 0 | true | 0 | 0 | -0.003588 | -88.0 | 1118 | 2176 |
| core | luna | cursor-pagination | 0 | true | 0 | 0 | -0.002016 | 3633.0 | 1096 | 1408 |
| core | luna | retry-idempotency | 0 | false | -1 | unknown | unknown | -20446.0 | -8616 | -3584 |
| core | luna | tenant-cache | 0 | true | 0 | 0 | -0.002071 | 5048.0 | 1114 | 1536 |
| core | luna | window-scheduler | 0 | true | 0 | 0 | -0.001849 | 841.0 | 1027 | 896 |
| core | nemotron | cursor-pagination | 0 | true | 0 | 0 | -0.002310 | 1075.0 | 819 | 1280 |
| core | nemotron | retry-idempotency | 0 | true | 0 | 0 | 0.008408 | -2144.0 | 1397 | -3584 |
| core | nemotron | tenant-cache | 0 | true | 0 | 0 | -0.002150 | 9290.0 | 1183 | 1536 |
| core | nemotron | window-scheduler | 0 | true | 0 | 0 | 0.002316 | -6334.0 | 1019 | -1280 |
| core | pi | cursor-pagination | 0 | true | 0 | 0 | 0.002722 | 1031.0 | 930 | -256 |
| core | pi | retry-idempotency | 0 | true | 0 | 0 | 0.013212 | 19122.0 | 5975 | 384 |
| core | pi | tenant-cache | 0 | true | 0 | 0 | 0.008178 | 8097.0 | 2580 | -1024 |
| core | pi | window-scheduler | 0 | true | 0 | 0 | 0.001330 | 5569.0 | 4122 | 3584 |
| core | rules | cursor-pagination | 0 | true | 0 | 0 | -0.002358 | 9077.0 | 9 | 1280 |
| core | rules | retry-idempotency | 0 | false | -1 | unknown | unknown | -21227.0 | -8616 | -3584 |
| core | rules | tenant-cache | 0 | true | 0 | 0 | -0.000048 | -6200.0 | -4 | 0 |
| core | rules | window-scheduler | 0 | true | 0 | 0 | 0.001954 | -4635.0 | -75 | -1280 |
| pi | core | cursor-pagination | 0 | true | 0 | 0 | -0.002722 | -1031.0 | -930 | 256 |
| pi | core | retry-idempotency | 0 | true | 0 | 0 | -0.013212 | -19122.0 | -5975 | -384 |
| pi | core | tenant-cache | 0 | true | 0 | 0 | -0.008178 | -8097.0 | -2580 | 1024 |
| pi | core | window-scheduler | 0 | true | 0 | 0 | -0.001330 | -5569.0 | -4122 | -3584 |
| pi | jev-gated | cursor-pagination | 0 | true | 0 | 0 | -0.005794 | 3000.0 | -1026 | 1536 |
| pi | jev-gated | retry-idempotency | 0 | true | 0 | 0 | -0.008032 | -15495.0 | -5796 | -2560 |
| pi | jev-gated | tenant-cache | 0 | true | 0 | 0 | -0.008114 | -11231.0 | -2564 | 1024 |
| pi | jev-gated | window-scheduler | 0 | true | 0 | 0 | -0.005232 | -7275.0 | -4115 | -1536 |
| pi | jev | cursor-pagination | 0 | true | 0 | 0 | -0.004317 | -4390.0 | 947 | 1920 |
| pi | jev | retry-idempotency | 0 | false | -1 | unknown | unknown | -39611.0 | -14591 | -3968 |
| pi | jev | tenant-cache | 0 | true | 0 | 0 | -0.009631 | -3020.0 | -927 | 2560 |
| pi | jev | window-scheduler | 0 | false | 0 | unknown | unknown | 8845.0 | -2695 | -1408 |
| pi | lightning | cursor-pagination | 0 | true | 0 | 0 | -0.000623 | -2729.0 | 190 | -512 |
| pi | lightning | retry-idempotency | 0 | true | 0 | 0 | -0.012412 | -4294.0 | -4723 | -256 |
| pi | lightning | tenant-cache | 0 | true | 0 | 0 | -0.005942 | -10480.0 | -1397 | 256 |
| pi | lightning | window-scheduler | 0 | true | 0 | 0 | -0.004919 | -5657.0 | -3004 | -1408 |
| pi | luna | cursor-pagination | 0 | true | 0 | 0 | -0.004739 | 2602.0 | 166 | 1664 |
| pi | luna | retry-idempotency | 0 | false | -1 | unknown | unknown | -39568.0 | -14591 | -3968 |
| pi | luna | tenant-cache | 0 | true | 0 | 0 | -0.010249 | -3049.0 | -1466 | 2560 |
| pi | luna | window-scheduler | 0 | true | 0 | 0 | -0.003179 | -4728.0 | -3095 | -2688 |
| pi | nemotron | cursor-pagination | 0 | true | 0 | 0 | -0.005032 | 44.0 | -111 | 1536 |
| pi | nemotron | retry-idempotency | 0 | true | 0 | 0 | -0.004805 | -21266.0 | -4578 | -3968 |
| pi | nemotron | tenant-cache | 0 | true | 0 | 0 | -0.010328 | 1193.0 | -1397 | 2560 |
| pi | nemotron | window-scheduler | 0 | true | 0 | 0 | 0.000986 | -11903.0 | -3103 | -4864 |
| pi | rules | cursor-pagination | 0 | true | 0 | 0 | -0.005080 | 8046.0 | -921 | 1536 |
| pi | rules | retry-idempotency | 0 | false | -1 | unknown | unknown | -40349.0 | -14591 | -3968 |
| pi | rules | tenant-cache | 0 | true | 0 | 0 | -0.008226 | -14297.0 | -2584 | 1024 |
| pi | rules | window-scheduler | 0 | true | 0 | 0 | 0.000624 | -10204.0 | -4197 | -4864 |

Frozen manifest SHA-256: `2db6af9d4ebc4a0289e376e738087e432b92c91fa378237b441465bb5c344964`.

Local evidence links point to ignored run files on this machine; raw run output is not embedded in this report.

- [001-retry-idempotency-pi-r0](../.suffice/runs/pilot-low-v3/001-retry-idempotency-pi-r0/result.json)
- [002-retry-idempotency-core-r0](../.suffice/runs/pilot-low-v3/002-retry-idempotency-core-r0/result.json)
- [003-retry-idempotency-rules-r0](../.suffice/runs/pilot-low-v3/003-retry-idempotency-rules-r0/result.json)
- [004-retry-idempotency-luna-r0](../.suffice/runs/pilot-low-v3/004-retry-idempotency-luna-r0/result.json)
- [005-retry-idempotency-jev-r0](../.suffice/runs/pilot-low-v3/005-retry-idempotency-jev-r0/result.json)
- [006-retry-idempotency-lightning-r0](../.suffice/runs/pilot-low-v3/006-retry-idempotency-lightning-r0/result.json)
- [007-retry-idempotency-nemotron-r0](../.suffice/runs/pilot-low-v3/007-retry-idempotency-nemotron-r0/result.json)
- [008-retry-idempotency-jev-gated-r0](../.suffice/runs/pilot-low-v3/008-retry-idempotency-jev-gated-r0/result.json)
- [009-cursor-pagination-core-r0](../.suffice/runs/pilot-low-v3/009-cursor-pagination-core-r0/result.json)
- [010-cursor-pagination-rules-r0](../.suffice/runs/pilot-low-v3/010-cursor-pagination-rules-r0/result.json)
- [011-cursor-pagination-luna-r0](../.suffice/runs/pilot-low-v3/011-cursor-pagination-luna-r0/result.json)
- [012-cursor-pagination-jev-r0](../.suffice/runs/pilot-low-v3/012-cursor-pagination-jev-r0/result.json)
- [013-cursor-pagination-lightning-r0](../.suffice/runs/pilot-low-v3/013-cursor-pagination-lightning-r0/result.json)
- [014-cursor-pagination-nemotron-r0](../.suffice/runs/pilot-low-v3/014-cursor-pagination-nemotron-r0/result.json)
- [015-cursor-pagination-jev-gated-r0](../.suffice/runs/pilot-low-v3/015-cursor-pagination-jev-gated-r0/result.json)
- [016-cursor-pagination-pi-r0](../.suffice/runs/pilot-low-v3/016-cursor-pagination-pi-r0/result.json)
- [017-tenant-cache-rules-r0](../.suffice/runs/pilot-low-v3/017-tenant-cache-rules-r0/result.json)
- [018-tenant-cache-luna-r0](../.suffice/runs/pilot-low-v3/018-tenant-cache-luna-r0/result.json)
- [019-tenant-cache-jev-r0](../.suffice/runs/pilot-low-v3/019-tenant-cache-jev-r0/result.json)
- [020-tenant-cache-lightning-r0](../.suffice/runs/pilot-low-v3/020-tenant-cache-lightning-r0/result.json)
- [021-tenant-cache-nemotron-r0](../.suffice/runs/pilot-low-v3/021-tenant-cache-nemotron-r0/result.json)
- [022-tenant-cache-jev-gated-r0](../.suffice/runs/pilot-low-v3/022-tenant-cache-jev-gated-r0/result.json)
- [023-tenant-cache-pi-r0](../.suffice/runs/pilot-low-v3/023-tenant-cache-pi-r0/result.json)
- [024-tenant-cache-core-r0](../.suffice/runs/pilot-low-v3/024-tenant-cache-core-r0/result.json)
- [025-window-scheduler-luna-r0](../.suffice/runs/pilot-low-v3/025-window-scheduler-luna-r0/result.json)
- [026-window-scheduler-jev-r0](../.suffice/runs/pilot-low-v3/026-window-scheduler-jev-r0/result.json)
- [027-window-scheduler-lightning-r0](../.suffice/runs/pilot-low-v3/027-window-scheduler-lightning-r0/result.json)
- [028-window-scheduler-nemotron-r0](../.suffice/runs/pilot-low-v3/028-window-scheduler-nemotron-r0/result.json)
- [029-window-scheduler-jev-gated-r0](../.suffice/runs/pilot-low-v3/029-window-scheduler-jev-gated-r0/result.json)
- [030-window-scheduler-pi-r0](../.suffice/runs/pilot-low-v3/030-window-scheduler-pi-r0/result.json)
- [031-window-scheduler-core-r0](../.suffice/runs/pilot-low-v3/031-window-scheduler-core-r0/result.json)
- [032-window-scheduler-rules-r0](../.suffice/runs/pilot-low-v3/032-window-scheduler-rules-r0/result.json)

- Descriptive pilot only; small samples do not establish significance or real-world performance.
- Core versus Pi compares a prompt/tool bundle; watcher versus core compares an added observer.
- Intention-to-treat operational success includes scheduled missing results and provider/watcher failures. Missing results are incomplete executions, not evidence of model inability.
- Treated-valid efficacy excludes unavailable acceptance, main failure, missing cost telemetry, watcher errors, and missing decision records. This selected subset is descriptive and can be biased.
- Costs are API-equivalent estimates for subscription models plus estimated external watcher spend, not an actual subscription bill or verified provider invoice.
- Known cost includes failed attempts and known components of partially costed runs. Incomplete cost/success is a nonnegative lower bound; null never means zero.
- Jev ledger reservations are conservative budget consumption, separate from usage-based estimated spend; global reservations cannot be attributed to a campaign.
- Provider cache warmth was observed rather than controlled. Fixed task/repetition pairs do not remove order or availability effects.
