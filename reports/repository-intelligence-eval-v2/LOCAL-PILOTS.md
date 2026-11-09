# Local real-issue calibration

These are disjoint pilots, not a final held-out benchmark. The earlier saturated study remains quarantined. All attempts use **gpt-6-luna / xhigh / default** and their own Git repository.

## hard-native-pilot

| Mode | Run status | Accepted patch | Target cases | Required regressions | Agent time | Estimated cost | Graph queries |
|---|---|---|---:|---:|---:|---:|---:|
| Baseline | completed | yes | 3/3 | 39/39 | 349.0 s | $0.01489 | 0 |
| Guided | completed | yes | 3/3 | 39/39 | 372.3 s | $0.01782 | 20 |
| On-demand | completed | yes | 3/3 | 39/39 | 468.5 s | $0.02192 | 11 |

3/3 attempts recorded; 3 finished normally. Same CLI implementation across observed modes: true. Matched starting Git HEAD/tree: true.

## svelte-native-pilot

| Mode | Run status | Accepted patch | Target cases | Required regressions | Agent time | Estimated cost | Graph queries |
|---|---|---|---:|---:|---:|---:|---:|
| Baseline | completed | no | 44/48 | 1607/1607 | 417.8 s | $0.02539 | 0 |
| Guided | completed | no | 36/48 | 1607/1607 | 449.6 s | $0.12537 | 25 |
| On-demand | budget_or_incomplete | no | 44/48 | 1607/1607 | 706.4 s | unknown | 9 |

3/3 attempts recorded; 2 finished normally. Same CLI implementation across observed modes: true. Matched starting Git HEAD/tree: true.

## svelte-outro-pilot

| Mode | Run status | Accepted patch | Target cases | Required regressions | Agent time | Estimated cost | Graph queries |
|---|---|---|---:|---:|---:|---:|---:|
| Baseline | completed | no | 0/6 | 1863/1863 | 466.5 s | $0.02191 | 0 |
| Guided | completed | no | 0/6 | 1863/1863 | 285.5 s | $0.01307 | 16 |
| On-demand | agent_error | no | 3/6 | 1863/1863 | 291.7 s | unknown | 5 |

3/3 attempts recorded; 2 finished normally. Same CLI implementation across observed modes: true. Matched starting Git HEAD/tree: true.

## Interpretation

Axios: all modes passed the three targeted upstream cases and 39 existing regressions. This issue supplies no accuracy separation.

Svelte: baseline passed 44/48 target criteria and all 1,607 required regressions. Its four misses are generated-output snapshots (decimal/base-36 scope IDs and helper layout). Preserve the strict score, but do not describe those four misses as independently demonstrated runtime failures. Guided results and all raw evidence remain alongside it. Three pre-existing binding-select failures and 53 skips remain visible; they are not counted as passes.

The transition pilot baseline and guided runs each failed all six hidden runtime targets while preserving all 1,863 required regressions. On-demand was interrupted by a provider 503 (account temporarily unavailable); its partial patch is recorded, but it is not a completed coding comparison. Unknown usage stays reserved. Graph evidence was bounded in this pilot; earlier compiler timings and costs used another implementation.

The guided compiler pilot is substantially more expensive in this observation. Prompt payload volume, graph coverage and repeated runs must be examined before making a general claim about graph benefit or harm. A fresh behavior-focused holdout is still required.

## Verification and resources

The root test suite passed 128/128 with test files executed serially. Empty/reference validation passed for all three pilots. Provider model/effort/tier and usage receipts are audited in `native-pilots.json`. CAM spot checks showed 66–69°C. Every agent attempt was serial; temperatures were not continuously monitored.

Known experiment-wide API-equivalent estimate: $2.10561. Conservatively reserved: $3.41776 of $12. Unknown older usage remains reserved.

## Limits

- Three issues across two repository families, one attempt per mode; no efficacy estimate, confidence interval or model ranking.
- A/B/C order was fixed within each pilot, not randomized.
- Native adaptations retain explicit environment/coverage caveats in their validation receipts.
- The class-scoping pilot includes exact generated-output snapshots; test rejection is not by itself proof of an observable runtime defect.
- Some Svelte environment preparation overlapped Axios C; compare observed timings descriptively only.
- Graph-refresh time omits on-demand initial hashing and is not a causal decomposition of latency.
- Worker RSS excludes child build/test processes; whole-machine free RAM includes unrelated applications.
- Temperature readings were manual CAM UI spot checks, not continuous recording or an automatic ceiling.
- No scope-pattern flags is not proof of no out-of-scope access; native process scope is not an OS sandbox.
- All dollar figures are API-equivalent estimates, not subscription billing.
