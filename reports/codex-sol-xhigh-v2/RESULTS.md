# Suffice versus native Codex — GPT-6.1 Sol xhigh

Recorded 20/20 attempts on the original ten historical issues. These are exposed development tasks, not a fresh holdout. Quality is frozen-check acceptance, not the Coding Agent Index.
**Contract qualification:** q02 has conflicting public signals about the `next` event. Its primary rejection is preserved, but is not used to claim an undisputed capability gap. See Q02-CONTRACT-REVIEW.md and the sensitivity below.

| Metric | Suffice | Native Codex 0.163.0 |
| --- | ---: | ---: |
| Attempts | 10 | 10 |
| Accepted on frozen checks | 10 | 9 |
| Budget-certified successes | 10 | 9 |
| Total inference, all attempts | $1.966792 | $2.263853 |
| Mean cost per attempt | $0.196679 | $0.226385 |
| Median attempt cost | $0.174995 | $0.214888 |
| Cost per accepted task, including failures | $0.196679 | $0.251539 |
| Fresh input tokens | 453,309 | 450,598 |
| Cached input tokens | 2,718,336 | 5,174,272 |
| Total input tokens including cache | 3,171,645 | 5,624,870 |
| Output tokens including reasoning | 78,834 | 84,523 |
| Reasoning tokens, already included in output | 45,548 | 44,722 |
| Model responses | 126 | 148 |
| Model-visible tool calls | 116 | 138 |
| Mean actor seconds | 269.8 | 206.3 |
| Median actor seconds | 242.1 | 227.4 |
| Operational failures | 0 | 0 |
| Completed coding failures | 0 | 1 |
| Attempts with unknown full costs | 0 | 0 |

All costs are API-equivalent inference estimates, not subscription cash charges. Setup checks and engineering inference are outside this scored table. Missing retry usage stays unknown. Reasoning is not billed twice. Native model responses come from deduplicated token_usage_record receipts, not a reconstructed HTTP request count. Tool-call observability differs; raw and primitive counts are preserved per attempt. Actor latency includes native commands and retries but excludes independent grading.

Both actors use the same original task text, pre-fix bytes, dependencies, ceilings and external filesystem boundary. They keep their native system instructions and tools. Codex keeps native code execution and compaction. Both get the same virtual-address compatibility allowance and observed RSS ceiling; see the frozen protocol. Native graders restore original tests and keep private acceptance outside actor mounts.

One observation per task and harness, six source repositories, reused issues, incomplete upstream CI and known limitations of frozen graders prevent a general superiority claim. Passing frozen checks is not proof of complete behavioral correctness. Post-hoc regression checks are supplementary and do not silently rewrite primary scores.

| Task | Suffice | Codex | Suffice cost | Codex cost |
| --- | --- | --- | ---: | ---: |
| s01 | Pass | Pass | $0.181369 | $0.216300 |
| i01 | Pass | Pass | $0.157440 | $0.183109 |
| q04 | Pass | Pass | $0.308534 | $0.224958 |
| i03 | Pass | Pass | $0.166057 | $0.213476 |
| s02 | Pass | Pass | $0.224516 | $0.195194 |
| s03 | Pass | Pass | $0.228131 | $0.267840 |
| i02 | Pass | Pass | $0.131271 | $0.183825 |
| i04 | Pass | Pass | $0.160560 | $0.193966 |
| q01 | Pass | Pass | $0.168620 | $0.285696 |
| q02 | Pass | Fail | $0.240292 | $0.299489 |

Across 10 fully priced pairs, observed Suffice mean-cost saving is 13.12%; it is cheaper on 8 pairs. Descriptive paired-task bootstrap percentiles: -1.2% to 25.0%. This is a sensitivity analysis of this small cohort, not a population confidence claim.

Budget stops (time/cost/response/tool ceilings) are reported separately from operational failures. The source result files retain their original status and boolean fields; this parent summary distinguishes those cases explicitly.
- suffice: 0 budget stops; cost per budget-qualified success $0.196679.
- codex: 0 budget stops; cost per budget-qualified success $0.251539.

The interrupted v1 Codex issue attempt is preserved, with $0.120766 known inference and an unknown in-flight response. Including it, Codex has 11 issue attempts, known issue inference of at least $2.384620, and unknown full total. Setup compatibility checks add further known $0.022727. Across both harnesses and setup, the known total is $4.374138; full overall cost remains unknown. Engineering inference is still excluded. These are not silently discarded costs.

Nine-pair contract sensitivity (post-outcome exclusion of q02; all q02 costs remain in the main ledger):

| Metric | Suffice | Native Codex |
| --- | ---: | ---: |
| Issues attempted | 9 | 9 |
| Accepted | 9 | 9 |
| Total cost | $1.726499 | $1.964364 |
| Mean cost per attempt | $0.191833 | $0.218263 |
| Median attempt cost | $0.168620 | $0.213476 |
| Cost per accepted task | $0.191833 | $0.218263 |
