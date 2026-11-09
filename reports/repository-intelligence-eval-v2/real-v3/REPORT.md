# Real-issue repository intelligence evaluation

No main model attempts have run. The 24-task cohort is frozen; environment preparation is reported separately.

All modes use gpt-6-luna, xhigh and default tier. See `protocol.json` and [methodology](../../../docs/REPOSITORY-INTELLIGENCE-REAL-V3.md). Earlier saturated runs and calibration pilots are not pooled here.

## Aggregate accuracy and cost

| Category | Mode | Accepted / scorable | Planned | Missing / infrastructure | Known estimated cost | Unknown-cost attempts | Mean agent time |
|---|---|---:|---:|---:|---:|---:|---:|
| all | Baseline | 0/0 | 48 | 48 | $0.00000 | 0 | — |
| all | Always-guided | 0/0 | 48 | 48 | $0.00000 | 0 | — |
| all | On-demand | 0/0 | 48 | 48 | $0.00000 | 0 | — |
| simple | Baseline | 0/0 | 16 | 16 | $0.00000 | 0 | — |
| simple | Always-guided | 0/0 | 16 | 16 | $0.00000 | 0 | — |
| simple | On-demand | 0/0 | 16 | 16 | $0.00000 | 0 | — |
| cross-file | Baseline | 0/0 | 16 | 16 | $0.00000 | 0 | — |
| cross-file | Always-guided | 0/0 | 16 | 16 | $0.00000 | 0 | — |
| cross-file | On-demand | 0/0 | 16 | 16 | $0.00000 | 0 | — |
| complex | Baseline | 0/0 | 16 | 16 | $0.00000 | 0 | — |
| complex | Always-guided | 0/0 | 16 | 16 | $0.00000 | 0 | — |
| complex | On-demand | 0/0 | 16 | 16 | $0.00000 | 0 | — |

Known cost is a lower bound where usage is missing; `results.json` includes token totals and cost per accepted attempt when measurable. Verified budget-stopped patches can count as accepted; normal completion is separate. Unverified patches do not count as accepted. Infrastructure cells are not reported as coding failures.

## Paired differences

| Comparison | Category | Complete tasks, both repetitions | Mean success difference | Conditional task bootstrap 95% |
|---|---|---:|---:|---|
| B minus A | all | 0 | — | not estimated |
| C minus A | all | 0 | — | not estimated |
| B minus A | simple | 0 | — | not estimated |
| C minus A | simple | 0 | — | not estimated |
| B minus A | cross-file | 0 | — | not estimated |
| C minus A | cross-file | 0 | — | not estimated |
| B minus A | complex | 0 | — | not estimated |
| C minus A | complex | 0 | — | not estimated |

Intervals describe these sampled tasks and do not establish general superiority or equivalence.

## Per-task outcomes

Each entry is accepted/scorable, out of two planned repetitions. Missing and infrastructure states are preserved in the machine-readable rows.

| Task | Category | Baseline | Always-guided | On-demand |
|---|---|---:|---:|---:|
| sveltejs__svelte-1294 | simple | 0/0 | 0/0 | 0/0 |
| sveltejs__svelte-980 | simple | 0/0 | 0/0 | 0/0 |
| sveltejs__svelte-1292 | simple | 0/0 | 0/0 | 0/0 |
| sveltejs__svelte-851 | simple | 0/0 | 0/0 | 0/0 |
| sveltejs__svelte-1047 | simple | 0/0 | 0/0 | 0/0 |
| sveltejs__svelte-1048 | simple | 0/0 | 0/0 | 0/0 |
| sveltejs__svelte-1365 | simple | 0/0 | 0/0 | 0/0 |
| sveltejs__svelte-1185 | simple | 0/0 | 0/0 | 0/0 |
| sveltejs__svelte-1516 | cross-file | 0/0 | 0/0 | 0/0 |
| sveltejs__svelte-1315 | cross-file | 0/0 | 0/0 | 0/0 |
| sveltejs__svelte-1312 | cross-file | 0/0 | 0/0 | 0/0 |
| sveltejs__svelte-1364 | cross-file | 0/0 | 0/0 | 0/0 |
| sveltejs__svelte-1243 | cross-file | 0/0 | 0/0 | 0/0 |
| sveltejs__svelte-1420 | cross-file | 0/0 | 0/0 | 0/0 |
| sveltejs__svelte-931 | cross-file | 0/0 | 0/0 | 0/0 |
| sveltejs__svelte-1309 | cross-file | 0/0 | 0/0 | 0/0 |
| sveltejs__svelte-709 | complex | 0/0 | 0/0 | 0/0 |
| sveltejs__svelte-599 | complex | 0/0 | 0/0 | 0/0 |
| sveltejs__svelte-1345 | complex | 0/0 | 0/0 | 0/0 |
| sveltejs__svelte-605 | complex | 0/0 | 0/0 | 0/0 |
| sveltejs__svelte-1493 | complex | 0/0 | 0/0 | 0/0 |
| sveltejs__svelte-1529 | complex | 0/0 | 0/0 | 0/0 |
| sveltejs__svelte-835 | complex | 0/0 | 0/0 | 0/0 |
| sveltejs__svelte-889 | complex | 0/0 | 0/0 | 0/0 |

## Tokens, verification and graph overhead

| Mode | Uncached input | Cached input | Output | Cost per accepted attempt | Graph queries | Refresh sum | Version-scan sum |
|---|---:|---:|---:|---|---:|---:|---:|
| Baseline | 0 | 0 | 0 | not defined | 0 | 0.00 s | 0.00 s |
| Always-guided | 0 | 0 | 0 | not defined | 0 | 0.00 s | 0.00 s |
| On-demand | 0 | 0 | 0 | not defined | 0 | 0.00 s | 0.00 s |

Refresh and scan values are summed operation latencies, not a wall-time decomposition. Token/cost totals include infrastructure attempts. Normal completions, accepted partial patches, maximum observed RSS, graph/cache sizes and guidance/request bytes are separate machine-readable fields. Verification-command mentions are a proxy; independent grading establishes the reported test outcomes.

Logged trigger labels (phase/reason), across recorded attempts:

- Always-guided: no triggers recorded
- On-demand: no triggers recorded

## Failure and mechanism evidence

Full per-attempt target misses, runtime-target counts, regressions, provider errors, tool calls, trigger reasons and resource measurements are in `results.json`. Raw trajectories and exact production archives remain beside it. A rejected generated snapshot does not by itself establish a runtime defect.

Graph query exposure and later path overlap are observational. This study does not isolate initial-context, dependency, test-selection and retry mechanisms causally. Upstream patch-path differences do not independently measure unnecessary edits or missed dependencies. No stronger model judges implementations.

## Recommendation

Keep repository intelligence opt-in. The planned evaluation is incomplete; no adoption claim follows from the current partial outcomes.

## Limits

- Fixed historical issues from one repository family, with correlated issue clusters and possible training contamination.
- Categories reflect edit locality and audited change breadth, not an established model-hardness scale.
- All official target/regression labels retained. Explicit unscored native incompatibilities are omitted, never counted as passes.
- Provider failures, missing runs, invalid configurations and evaluator failures are separate from scorable engineering attempts.
- Cost includes infrastructure attempts; missing usage remains unknown. Dollar figures are estimates, not subscription invoices.
- Both repetitions are required for each task in paired differences. Bootstrap resamples tasks; no interval below five complete task pairs.
- Intervals condition on this fixed sample. An all-tie [0,0] interval does not establish population equivalence.
- Guidance followed by path overlap is temporal evidence, not proof of causal influence. Bash-based path use can be missed.
- Reference-path deviations are proxies, not proof of missed dependencies or unnecessary edits.
- Summed refresh/scan latencies do not decompose wall time; 10-second RSS/RAM samples can miss peaks and exclude child-process RSS.
- No reliable temperature telemetry is available; all dispatch is serialized.
