# Context and control experiments

Execution bookkeeping across these separate campaigns: 58 recorded runs, 51 completed with accepted patches, 53 accepted patches including runs that failed to finish. These are not pooled accuracy estimates.

Transfer cohort (two tasks, two repetitions): core/Sol 4/4; Luna-only 3/4; Luna-to-Sol routing 4/4. Luna's recorded failure omitted live tenant filtering. Costs and missing telemetry are shown per arm below.

Revised selectors have 0 pruned requests in this cohort. Passing without pruning does not demonstrate active context-selection quality.

Exploratory synthetic tasks, not a real-repository benchmark. Each campaign is separate. Subscription costs are API-equivalent estimates; all auxiliary inference is included. Unknown cost is not treated as zero. Cache warmth is observed, not controlled.

The original transcript is retained. Replacement arms prune complete historical groups; they do not delete source files or permanently revoke retrieval. Delegate means bounded read-only exact-quote assistance, not a full autonomous worker. Graph means lexical imports and reverse dependencies, not a semantic call graph. Routing is a fixed Luna-to-Sol heuristic, not a trained policy.

## context-screen-v4

| Arm | Completed + passed / scheduled | Accepted patches | Valid treatment runs | Mean total estimated USD | Pruned requests | Injections | Model switches |
|---|---:|---:|---:|---:|---:|---:|---:|
| bounded | 1/1 | 1 | 1 | 0.02050 (1/1 known) | 0 | 0 | 0 |
| cache-select | 1/1 | 1 | 1 | 0.01827 (1/1 known) | 0 | 0 | 0 |
| compact | 0/1 | 0 | 0 | unknown (0/1 known) | 11 | 0 | 0 |
| core | 1/1 | 1 | 1 | 0.02878 (1/1 known) | 0 | 0 | 0 |
| default-code | 1/1 | 1 | 1 | 0.03168 (1/1 known) | 0 | 0 | 0 |
| delegate | 1/1 | 1 | 1 | 0.02743 (1/1 known) | 0 | 2 | 0 |
| graph | 1/1 | 1 | 1 | 0.02003 (1/1 known) | 0 | 4 | 0 |
| luna | 1/1 | 1 | 1 | 0.02262 (1/1 known) | 0 | 4 | 0 |
| luna-worker | 1/1 | 1 | 1 | 0.00134 (1/1 known) | 0 | 0 | 0 |
| pi | 1/1 | 1 | 1 | 0.04432 (1/1 known) | 0 | 0 | 0 |
| route | 1/1 | 1 | 1 | 0.03333 (1/1 known) | 0 | 0 | 1 |
| select-gemma | 1/1 | 1 | 0 | unknown (0/1 known) | 0 | 0 | 0 |
| select-jev | 0/1 | 1 | 0 | unknown (0/1 known) | 19 | 0 | 0 |
| select-lightning | 0/1 | 0 | 0 | unknown (0/1 known) | 11 | 0 | 0 |
| select-luna | 0/1 | 1 | 0 | unknown (0/1 known) | 17 | 0 | 0 |
| select-nemotron | 0/1 | 0 | 0 | unknown (0/1 known) | 15 | 0 | 0 |
| select-rules | 0/1 | 0 | 0 | unknown (0/1 known) | 12 | 0 | 0 |
| short-direct | 1/1 | 1 | 1 | 0.04240 (1/1 known) | 0 | 0 | 0 |

Details: [context-screen-v4.md](context-screen-v4.md).

Valid-treatment counts exclude missing cost telemetry and unavailable auxiliary treatment; consult operational pass counts independently. Means only cover known-cost runs and may be selection-biased.

## context-working-smoke-v5

| Arm | Completed + passed / scheduled | Accepted patches | Valid treatment runs | Mean total estimated USD | Pruned requests | Injections | Model switches |
|---|---:|---:|---:|---:|---:|---:|---:|
| core | 1/1 | 1 | 1 | 0.02208 (1/1 known) | 0 | 0 | 0 |
| stable-jev | 1/1 | 1 | 1 | 0.02617 (1/1 known) | 0 | 0 | 0 |
| stable-luna | 1/1 | 1 | 1 | 0.01900 (1/1 known) | 0 | 0 | 0 |
| stable-rules | 1/1 | 1 | 1 | 0.01790 (1/1 known) | 0 | 0 | 0 |

Details: [context-working-smoke-v5.md](context-working-smoke-v5.md).

Valid-treatment counts exclude missing cost telemetry and unavailable auxiliary treatment; consult operational pass counts independently. Means only cover known-cost runs and may be selection-biased.

## context-transfer-v5

| Arm | Completed + passed / scheduled | Accepted patches | Valid treatment runs | Mean total estimated USD | Pruned requests | Injections | Model switches |
|---|---:|---:|---:|---:|---:|---:|---:|
| cache-select | 4/4 | 4 | 4 | 0.02185 (4/4 known) | 0 | 0 | 0 |
| core | 4/4 | 4 | 3 | 0.02647 (3/4 known) | 0 | 0 | 0 |
| delegate | 4/4 | 4 | 3 | 0.03192 (3/4 known) | 0 | 6 | 0 |
| graph | 4/4 | 4 | 4 | 0.02559 (4/4 known) | 0 | 13 | 0 |
| luna-worker | 3/4 | 3 | 4 | 0.00158 (4/4 known) | 0 | 0 | 0 |
| route | 4/4 | 4 | 4 | 0.02254 (4/4 known) | 0 | 0 | 4 |
| stable-jev | 4/4 | 4 | 4 | 0.02309 (4/4 known) | 0 | 0 | 0 |
| stable-luna | 4/4 | 4 | 4 | 0.02398 (4/4 known) | 0 | 0 | 0 |
| stable-rules | 4/4 | 4 | 4 | 0.02072 (4/4 known) | 0 | 0 | 0 |

Details: [context-transfer-v5.md](context-transfer-v5.md).

Valid-treatment counts exclude missing cost telemetry and unavailable auxiliary treatment; consult operational pass counts independently. Means only cover known-cost runs and may be selection-biased.

## Interpretation limits

- Short exploratory runs cannot establish accuracy gains or a learned-policy moat.
- The v4 model selector sees bounded prefixes of historical groups; these can omit the tool evidence later in a group. This is a limitation of this implementation, not a limit on context selection generally.
- V5 stable selectors protect the first complete group and two recent groups, target 20,000 characters, exclude thinking from candidate excerpts, and attach omission metadata to a tool result. This bundle was tuned on inventory-reservations; transfer tasks were not used to tune it.
- Cache-aware selection uses a character-based eight-call-horizon cost forecast. Actual usage determines the reported costs.
- Model selection makes at most four calls, then reuses retained IDs alongside recent groups. Provider/format errors preserve full history for that call and mark the treatment unavailable.
- The 35-line read default is not a restriction: the worker can request more. If files fit inside 35 lines, this arm has little opportunity to intervene.
- No decision model was trained. These traces support future policy research; outcomes for unchosen actions remain unknown.
