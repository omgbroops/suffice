# Campaign context-working-smoke-v5

AI-authored synthetic context tasks. Descriptive results; no significance claim.

Main model: variant-specific: gpt-6.1-sol or gpt-6-luna; reasoning effort: low. Compare arms within this campaign; do not pool different effort settings.

Means show known telemetry coverage in parentheses. Subscription costs are API-equivalent estimates, not billed subscription spend. Total estimated cost also includes watcher estimates. Unknown costs are not zero.

| Variant | Recorded / scheduled | ITT success | Treated-valid success | Main API-equivalent mean $ | Total estimated mean $ | Mean latency ms | Mean total tokens | Mean cache reads | Mean watcher calls | Mean injections | Mean watcher errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| core | 1/1 | 1/1 | 1/1 | 0.022076 (1/1) | 0.022076 (1/1) | 46530.0 (1/1) | 13577.0 (1/1) | 5376.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) |
| stable-jev | 1/1 | 1/1 | 1/1 | 0.026168 (1/1) | 0.026168 (1/1) | 42385.0 (1/1) | 13300.0 (1/1) | 2560.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) |
| stable-luna | 1/1 | 1/1 | 1/1 | 0.019001 (1/1) | 0.019001 (1/1) | 48630.0 (1/1) | 13559.0 (1/1) | 6912.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) |
| stable-rules | 1/1 | 1/1 | 1/1 | 0.017897 (1/1) | 0.017897 (1/1) | 37109.0 (1/1) | 13339.0 (1/1) | 6912.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) | 0.0 (1/1) |

Costs per operational success include all known attempted-run costs, including unsuccessful runs. A partial lower bound is shown separately from a fully covered ratio.

| Variant | Known cost components $ | Complete cost coverage | Cost / success $ | Known cost / success lower bound $ | Status counts | Valid-subset exclusions | Watcher error codes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| core | 0.022076 | 1/1 | 0.022076 | 0.022076 | completed: 1 | none | none |
| stable-jev | 0.026168 | 1/1 | 0.026168 | 0.026168 | completed: 1 | none | none |
| stable-luna | 0.019001 | 1/1 | 0.019001 | 0.019001 | completed: 1 | none | none |
| stable-rules | 0.017897 | 1/1 | 0.017897 | 0.017897 | completed: 1 | none | none |

Intervention rates describe availability: a valid watcher arm may have no eligible source-read event. A watcher error remains an operational outcome even when the main agent succeeds.

| Variant | Runs with watcher calls | Runs with injection / recorded | Injection rate among eligible runs |
| --- | --- | --- | --- |
| core | 0 | 0/1 | unknown |
| stable-jev | 0 | 0/1 | unknown |
| stable-luna | 0 | 0/1 | unknown |
| stable-rules | 0 | 0/1 | unknown |

Jev usage-based estimates and global ledger reserves are separate. Estimates require returned input usage after dispatch; the $0.01 reservation on a failed request is not measured spend. Explicitly undispatched preflight failures have zero inference spend.

| Variant | Jev known estimated spend $ | Known / unknown Jev calls | Recorded reservations $ (coverage) |
| --- | --- | --- | --- |

Global Jev ledger: $0.14 reserved of $2.00, 14 reservations. This spans campaigns and is not campaign-attributed spend.

Paired differences are variant minus baseline on the same task and repetition. Operational success differences include failures; valid efficacy differences require both arms to be valid. Positive cost/latency differences mean greater resource use.

| Baseline | Variant | Task | Repetition | Valid pair | ITT success delta | Valid success delta | Estimated $ delta | Latency ms delta | Total token delta | Cache-read delta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| core | stable-jev | inventory-reservations | 0 | true | 0 | 0 | 0.004092 | -4145.0 | -277 | -2816 |
| core | stable-luna | inventory-reservations | 0 | true | 0 | 0 | -0.003074 | 2100.0 | -18 | 1536 |
| core | stable-rules | inventory-reservations | 0 | true | 0 | 0 | -0.004178 | -9421.0 | -238 | 1536 |

Frozen manifest SHA-256: `b31fec6d70fd878a2deaa2c331510c833100b35c33ba924a61b5c7f96bd2c930`.

Local evidence links point to ignored run files on this machine; raw run output is not embedded in this report.

- [001-inventory-reservations-core-r0](../.suffice/runs/context-working-smoke-v5/001-inventory-reservations-core-r0/result.json)
- [002-inventory-reservations-stable-rules-r0](../.suffice/runs/context-working-smoke-v5/002-inventory-reservations-stable-rules-r0/result.json)
- [003-inventory-reservations-stable-luna-r0](../.suffice/runs/context-working-smoke-v5/003-inventory-reservations-stable-luna-r0/result.json)
- [004-inventory-reservations-stable-jev-r0](../.suffice/runs/context-working-smoke-v5/004-inventory-reservations-stable-jev-r0/result.json)

- Descriptive pilot only; small samples do not establish significance or real-world performance.
- Core versus Pi compares a prompt/tool bundle; watcher versus core compares an added observer.
- Intention-to-treat operational success includes scheduled missing results and provider/watcher failures. Missing results are incomplete executions, not evidence of model inability.
- Treated-valid efficacy excludes unavailable acceptance, main failure, missing cost telemetry, watcher errors, and missing decision records. This selected subset is descriptive and can be biased.
- Costs are API-equivalent estimates for subscription models plus estimated external watcher spend, not an actual subscription bill or verified provider invoice.
- Known cost includes failed attempts and known components of partially costed runs. Incomplete cost/success is a nonnegative lower bound; null never means zero.
- Jev ledger reservations are conservative budget consumption, separate from usage-based estimated spend; global reservations cannot be attributed to a campaign.
- Provider cache warmth was observed rather than controlled. Fixed task/repetition pairs do not remove order or availability effects.
