# Real-issue repository intelligence evaluation

18 execution attempts recorded; 18/144 planned cells have scorable engineering outcomes. 126 cells remain unrun or affected by infrastructure/configuration problems.

All modes use gpt-6-luna, xhigh and default tier. See `protocol.json` and [methodology](../../../docs/REPOSITORY-INTELLIGENCE-REAL-V3.md). Earlier saturated runs and calibration pilots are not pooled here.

## Aggregate accuracy and cost

| Category | Mode | Accepted / scorable | Planned | Missing / infrastructure | Known estimated cost | Unknown-cost attempts | Mean agent time |
|---|---|---:|---:|---:|---:|---:|---:|
| all | Baseline | 5/6 | 48 | 42 | $0.16752 | 0 | 435.3 s |
| all | Always-guided | 6/6 | 48 | 42 | $0.17006 | 0 | 420.1 s |
| all | On-demand | 6/6 | 48 | 42 | $0.16099 | 0 | 493.6 s |
| simple | Baseline | 2/2 | 16 | 14 | $0.01246 | 0 | 113.2 s |
| simple | Always-guided | 2/2 | 16 | 14 | $0.01798 | 0 | 165.1 s |
| simple | On-demand | 2/2 | 16 | 14 | $0.01783 | 0 | 187.4 s |
| cross-file | Baseline | 1/2 | 16 | 14 | $0.03123 | 0 | 264.6 s |
| cross-file | Always-guided | 2/2 | 16 | 14 | $0.04992 | 0 | 425.1 s |
| cross-file | On-demand | 2/2 | 16 | 14 | $0.06435 | 0 | 630.0 s |
| complex | Baseline | 2/2 | 16 | 14 | $0.12382 | 0 | 928.1 s |
| complex | Always-guided | 2/2 | 16 | 14 | $0.10216 | 0 | 670.0 s |
| complex | On-demand | 2/2 | 16 | 14 | $0.07881 | 0 | 663.4 s |

Known cost is a lower bound where usage is missing; `results.json` includes token totals and cost per accepted attempt when measurable. Verified budget-stopped patches can count as accepted; normal completion is separate. Unverified patches do not count as accepted. Infrastructure cells are not reported as coding failures.

## Paired differences

| Comparison | Category | Complete tasks, both repetitions | Mean success difference | Conditional task bootstrap 95% |
|---|---|---:|---:|---|
| B minus A | all | 3 | 16.7 pp | not estimated |
| C minus A | all | 3 | 16.7 pp | not estimated |
| B minus A | simple | 1 | 0.0 pp | not estimated |
| C minus A | simple | 1 | 0.0 pp | not estimated |
| B minus A | cross-file | 1 | 50.0 pp | not estimated |
| C minus A | cross-file | 1 | 50.0 pp | not estimated |
| B minus A | complex | 1 | 0.0 pp | not estimated |
| C minus A | complex | 1 | 0.0 pp | not estimated |

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
| sveltejs__svelte-1048 | simple | 2/2 | 2/2 | 2/2 |
| sveltejs__svelte-1365 | simple | 0/0 | 0/0 | 0/0 |
| sveltejs__svelte-1185 | simple | 0/0 | 0/0 | 0/0 |
| sveltejs__svelte-1516 | cross-file | 1/2 | 2/2 | 2/2 |
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
| sveltejs__svelte-835 | complex | 2/2 | 2/2 | 2/2 |
| sveltejs__svelte-889 | complex | 0/0 | 0/0 | 0/0 |

## Tokens, verification and graph overhead

| Mode | Uncached input | Cached input | Output | Cost per accepted attempt | Graph queries | Refresh sum | Version-scan sum |
|---|---:|---:|---:|---|---:|---:|---:|
| Baseline | 457507 | 7946112 | 84622 | $0.03350 | 0 | 0.00 s | 0.00 s |
| Always-guided | 580194 | 7414784 | 75794 | $0.02834 | 165 | 318.34 s | 0.00 s |
| On-demand | 545776 | 6582144 | 81175 | $0.02683 | 58 | 118.25 s | 176.74 s |

Refresh and scan values are summed operation latencies, not a wall-time decomposition. Token/cost totals include infrastructure attempts. Normal completions, accepted partial patches, maximum observed RSS, graph/cache sizes and guidance/request bytes are separate machine-readable fields. Verification-command mentions are a proxy; independent grading establishes the reported test outcomes.

Logged trigger labels (phase/reason), across recorded attempts:

- Always-guided: after-edit:unreported = 23; initial:unreported = 6
- On-demand: on-demand:editing-exported-module = 26

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
