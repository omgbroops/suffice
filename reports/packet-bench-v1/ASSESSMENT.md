# Decision: retain the prototype, do not enable packets by default

The requested prototype and all 18 Sonion attempts are complete. Routing alone was the better cost tradeoff on these six reused development issues. Packets provided no additional accepted repairs, cost 6.4% more than routing alone, and took longer. This is not a fresh evaluation or evidence of a general 30x harness improvement.

| Configuration | Independent acceptance | Mean attempt cost | Cost per accepted task, including failures | Mean actor time |
|---|---:|---:|---:|---:|
| Normal Suffice, Sol Low | 5/6 | $0.05451 | $0.06541 | 65.5 seconds |
| Routing only, Sol Low / Luna High | 5/6 | $0.03919 | $0.04702 | 93.4 seconds |
| Routing plus packets | 5/6 | $0.04170 | $0.05004 | 102.7 seconds |

Observed total-cost reductions versus normal Suffice were 28.1% for routing and 23.5% for packets. Mean latency increased 42.6% and 56.8%, respectively. All accepted attempts were also budget-eligible. There were no unknown inference costs or operational failures among the 18 scored attempts. Total benchmark inference was **$0.81238196 API-equivalent**, excluding the engineering/coordinator session and actual subscription spending.

## What actually improved

The economical cases used Luna directly. The router selected Luna for Commander #2342 and PostCSS #2168. Both configurations using Luna passed both issues. Across those two issues, routing-only cost $0.01154 against $0.13058 for normal Sol, about 91.2% less. That is an observed model-price opportunity, not proof that packet decomposition saved work.

For the other four issues, routing-only selected the same Sol Low configuration as normal Suffice. Their combined cost was 13.8% higher in routing-only despite identical task specifications, illustrating trajectory and caching variability. With one observation per issue/arm, a precise general savings percentage is not established.

The raw work increased: normal/routing/packets used 38/61/76 model calls, 118,036/121,031/180,573 fresh input tokens, and 6,947/11,399/14,261 output tokens. Lower inference estimates came with more calls and more tokens, largely made affordable by the cheaper model. This was not a token-efficiency win.

## What did and did not activate

- Four issue descriptions were classified complex. Three generated valid plans and ran one Luna implementation packet each: Axios, fast-xml-parser, and Undici. No plan used two packets; parallel multi-packet execution was not tested.
- The schema issue's planner returned ten file references while the parser allows eight. The prompt did not explicitly state that file-count limit. The prototype rejected the plan and fell back to solo Sol. This is a **prototype protocol mismatch**, not a model capability failure. Its complete planning and fallback cost remains in the packet arm; it was not discarded or rerun.
- Planning consumed $0.13107, or 52.4% of packet-arm inference. The schema fallback implementation alone consumed another $0.09899. All planning and fallback overhead is included in the comparison.
- Simple issues correctly avoided planning and used one Luna session.
- All final public checks passed, so the public-failure Sol escalation policy activated zero times. This campaign does not validate escalation or reliable detection of an incorrect completion.

## The shared correctness failure

All three arms failed fast-xml-parser #874's UTF-8 BOM metadata case while passing public checks. Default `TextDecoder` decoding removed the BOM. Parsed node content was correct, but `captureMetaData` start/end positions shifted relative to equivalent string input.

This check is supported by the public task's input-equivalence requirement and the pre-fix public API: `src/fxp.d.ts` documents `captureMetaData` and character positions in the input stream. It does not require an arbitrary implementation or error-message phrase. Empty-patch controls failed and reference controls passed on the current environment.

The packet planner actually retrieved the metadata index declarations (`src/fxp.d.ts`, lines 710–774) but did not carry a BOM/offset preservation requirement into its packet. The worker retained unrestricted authorized source access; it nevertheless implemented the same problematic decoder behavior. This shows an omitted compatibility constraint despite extra planning. It does **not** establish that the handoff caused the failure: solo Sol also missed it. The observable failure is missing compatibility verification, not proof of what the model privately understood.

## Cache and receipt audit

| Arm | Calls with cached input | Cached share of input tokens |
|---|---:|---:|
| Normal | 28/38 | 64.6% |
| Routing | 53/61 | 83.1% |
| Packets | 63/76 | 79.7% |

Caching was observed in provider usage, not assumed from session boundaries. The experiment adds no cache warmup or prefix-rewriting system. Cross-attempt cache state was not independently reset; order was counterbalanced. Model mix, trajectories and caching cannot be causally separated here.

An independent offline audit repriced all 175 provider responses from fresh/cached/output counts and each stage's pinned price catalog. It reconciled every response with assistant receipts and stage totals, verified models/efforts/codemode access, checked all 45 frozen source/runtime/evaluator hashes, and confirmed fixing commits were unavailable in actor Git metadata. Reasoning tokens are already included in output; they were not charged twice. The largest observed actor process-tree RSS was about 851 MiB, below the shared 4 GiB ceiling.

Before inference, a failed preflight was preserved separately: the initial adapter reused a grading workspace after hidden overlays, and its detached WSL process did not survive SSH exit. The adapter was corrected to use pristine public control workspaces, and execution was kept alive through a foreground SSH connection. Zero coding attempts had started in that failed preflight. The corrected six baseline/reference and actor-network controls all passed before scored dispatch. These preparation problems are not concealed as coding failures or omitted paid attempts.

## Smallest justified next decision

Keep normal Suffice unchanged and both new modes opt-in. Keep routing-only as the simpler candidate. Do not credit packetization for gains already explained by direct Luna use, or ship it on these results.

Before another packet campaign, align the planner's instructions and parser limits. If further evaluation is authorized, the most informative missing control is **Luna alone on complex tasks**, compared with Sol planning plus Luna at the same allowance. That distinguishes useful planning from paying Sol to supervise work Luna could already do. Use fresh issues for that decision; these six remain exposed development tasks. No additional optimization campaign was started.

## Review materials and boundaries

- `RESULTS.md`: all per-attempt results, token/cost breakdowns and treatment activation.
- `summary.json`, `attempts.csv`, `independent-audit.json`: machine-readable results and independent repricing.
- `evaluation-inputs/`: public task snapshots, grader/reference copies and dependency manifests for evaluator review. These were outside actor mounts.
- `../../.suffice/packet-bench-v1/`: preserved prompts, patches, stage/session/provider receipts, checks and independent grades.
- `../../.suffice/packet-preflight-v1/`: the failed preparation run and original adapter snapshot; no inference attempts.

The source is copied from Suffice `af06ce5` with provenance recorded. The original Suffice checkout and prior benchmark artifacts were not modified. The default Pi-native interactive CLI remains the normal single-agent mode; packet execution is currently a separate opt-in JSON entrypoint. Nine compatibility/unit checks passed on Windows and Sonion. Mac hardware and long multi-component feature work were not evaluated here. No upstream pull requests or maintainer messages were sent.
