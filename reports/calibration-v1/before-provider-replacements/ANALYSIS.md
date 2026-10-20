# Calibration analysis

Completed: 21/32. Interim; compare only matched completed pairs.

| Arm | Accepted / completed | Known USD | USD / accepted | Mean seconds | Output tokens | Visible text chars | Sol calls | Repairs | Takeovers |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| pi | 2/2 | 0.062118 | 0.031059 | 46.2 | 2313 | 1258 | 0 | 0 | 0 |
| v1-original | 2/2 | 0.063211 | 0.031605 | 51.3 | 2452 | 1569 | 0 | 0 | 0 |
| v1-refined | 1/3 | ≥0.064855 | ≥0.064855 | 323.3 | 1601 | 1116 | 0 | 0 | 0 |
| v1-concise | 2/3 | 0.380958 | 0.190479 | 196.5 | 22875 | 1950 | 0 | 0 | 0 |
| v2-alone | 2/3 | 0.008754 | 0.004377 | 80.5 | 8204 | 811 | 0 | 0 | 0 |
| v2-upfront | 2/3 | 0.015422 | 0.007711 | 77.2 | 7428 | 3355 | 3 | 0 | 0 |
| v2-selective | 1/3 | 0.008577 | 0.008577 | 73.7 | 7368 | 786 | 0 | 0 | 0 |
| v2-concise | 2/2 | 0.003540 | 0.001770 | 44.0 | 2387 | 458 | 0 | 0 | 0 |

## Matched comparisons

Task order and arm policies were frozen before inference. Every selected failed attempt remains in cost denominators. User-authorized provider-interruption originals are excluded separately. Partial or unknown costs are floors.

v1-original versus pi: 2 matched tasks, known cost floors $0.063211 versus $0.062118; accepted-outcome wins (including infrastructure effects): none; regressions: none.
Fully accounted matched pairs: 2/2; costs $0.063211 versus $0.062118. Excluded from this accounting-only comparison: none. All outcomes remain in the table and overall denominator.
On these accounting pairs, cost change: +1.76%; wall-time change across 2 timed pairs: +11.08%. These are observed changes, with shared-host and provider contention.

v1-refined versus v1-original: 2 matched tasks, known cost floors $0.055067 versus $0.063211; accepted-outcome wins (including infrastructure effects): none; regressions: kv-store-grpc.
Fully accounted matched pairs: 1/2; costs $0.039897 versus $0.023486. Excluded from this accounting-only comparison: kv-store-grpc. All outcomes remain in the table and overall denominator.
On these accounting pairs, cost change: +69.88%; wall-time change across 1 timed pairs: -2.27%. These are observed changes, with shared-host and provider contention.

v1-concise versus v1-refined: 3 matched tasks, known cost floors $0.380958 versus $0.064855; accepted-outcome wins (including infrastructure effects): kv-store-grpc; regressions: none.
Fully accounted matched pairs: 1/3; costs $0.024483 versus $0.039897. Excluded from this accounting-only comparison: filter-js-from-html, kv-store-grpc. All outcomes remain in the table and overall denominator.
On these accounting pairs, cost change: -38.63%; wall-time change across 1 timed pairs: -10.36%. These are observed changes, with shared-host and provider contention.

v2-upfront versus v2-alone: 3 matched tasks, known cost floors $0.015422 versus $0.008754; accepted-outcome wins (including infrastructure effects): none; regressions: none.
Fully accounted matched pairs: 2/3; costs $0.009011 versus $0.004190. Excluded from this accounting-only comparison: filter-js-from-html. All outcomes remain in the table and overall denominator.
On these accounting pairs, cost change: +115.03%; wall-time change across 2 timed pairs: -1.06%. These are observed changes, with shared-host and provider contention.

v2-selective versus v2-alone: 3 matched tasks, known cost floors $0.008577 versus $0.008754; accepted-outcome wins (including infrastructure effects): none; regressions: kv-store-grpc.
Fully accounted matched pairs: 2/3; costs $0.004041 versus $0.004190. Excluded from this accounting-only comparison: filter-js-from-html. All outcomes remain in the table and overall denominator.
On these accounting pairs, cost change: -3.56%; wall-time change across 2 timed pairs: -5.26%. These are observed changes, with shared-host and provider contention.

v2-selective versus v2-upfront: 3 matched tasks, known cost floors $0.008577 versus $0.015422; accepted-outcome wins (including infrastructure effects): none; regressions: kv-store-grpc.
Fully accounted matched pairs: 2/3; costs $0.004041 versus $0.009011. Excluded from this accounting-only comparison: filter-js-from-html. All outcomes remain in the table and overall denominator.
On these accounting pairs, cost change: -55.15%; wall-time change across 2 timed pairs: -4.24%. These are observed changes, with shared-host and provider contention.

v2-concise versus v2-selective: 2 matched tasks, known cost floors $0.003540 versus $0.004041; accepted-outcome wins (including infrastructure effects): kv-store-grpc; regressions: none.
Fully accounted matched pairs: 2/2; costs $0.003540 versus $0.004041. Excluded from this accounting-only comparison: none. All outcomes remain in the table and overall denominator.
On these accounting pairs, cost change: -12.40%; wall-time change across 2 timed pairs: -7.91%. These are observed changes, with shared-host and provider contention.

## Verification gaps

Independent grades are observed only after actor shutdown and never fed into routing. A passed partial public check can therefore leave a real defect undetected. This is a coverage limit, not evidence that assistance was unnecessary.

| Arm | Independent failures after public pass | Public failures | Unavailable / not run |
| --- | ---: | ---: | ---: |
| pi | 0 | 0 | 0 |
| v1-original | 0 | 0 | 0 |
| v1-refined | 0 | 0 | 2 |
| v1-concise | 1 | 0 | 0 |
| v2-alone | 0 | 0 | 0 |
| v2-upfront | 0 | 0 | 0 |
| v2-selective | 1 | 0 | 0 |
| v2-concise | 0 | 0 | 0 |

## Every outcome

| Task | Arm | Independent grade | Public verification | Status | Known USD |
| --- | --- | --- | --- | --- | ---: |
| log-summary-date-ranges | pi | pass | passed | completed | 0.028478 |
| log-summary-date-ranges | v1-original | pass | passed | completed | 0.023486 |
| log-summary-date-ranges | v1-refined | pass | passed | completed | 0.039897 |
| log-summary-date-ranges | v1-concise | pass | passed | completed | 0.024483 |
| log-summary-date-ranges | v2-alone | pass | passed | completed | 0.002205 |
| log-summary-date-ranges | v2-upfront | pass | passed | completed | 0.004046 |
| log-summary-date-ranges | v2-selective | pass | passed | completed | 0.001388 |
| log-summary-date-ranges | v2-concise | pass | passed | completed | 0.001083 |
| kv-store-grpc | v1-original | pass | passed | completed | 0.039725 |
| kv-store-grpc | v1-refined | fail | not_run | cost_unknown | ≥0.015170 |
| kv-store-grpc | v1-concise | pass | passed | completed | 0.033176 |
| kv-store-grpc | v2-alone | pass | passed | completed | 0.001985 |
| kv-store-grpc | v2-upfront | pass | passed | completed | 0.004965 |
| kv-store-grpc | v2-selective | fail | passed | completed | 0.002653 |
| kv-store-grpc | v2-concise | pass | passed | completed | 0.002457 |
| kv-store-grpc | pi | pass | passed | completed | 0.033640 |
| filter-js-from-html | v1-refined | fail | not_run | cost_unknown | ≥0.009788 |
| filter-js-from-html | v1-concise | fail | passed | completed | 0.323300 |
| filter-js-from-html | v2-alone | ungraded | passed | completed | 0.004564 |
| filter-js-from-html | v2-upfront | ungraded | passed | completed | 0.006412 |
| filter-js-from-html | v2-selective | ungraded | passed | completed | 0.004536 |

API-equivalent estimates, not subscription charges. Full stage costs, cache tokens, calls, identity and receipt reconciliation are in results.json. Visible text is measured in characters, not billed tokens; reasoning and tool arguments can dominate output cost.
Four purposively chosen tasks and one attempt per configuration cannot establish population accuracy or robust causal gains. V1 scope and repair are a bundle; V2 assistance arms compare routing policies with the rest of the core held fixed. Concise changes instructions only.
At most four containers share the host; observed-memory admission may reduce overlap. Shared CPU, network, caching and grading contention limit latency comparisons. No JS/TS source task measures the AST-navigation advantage.
Required product state is not classified as an optional prerequisite. Missing checker infrastructure remains unverified, never accepted by the controller. Independent grading remains separate and cannot trigger assistance.
No global skills, arbitrary compaction or default changes. Original campaign reports and runtime receipts remain preserved.

## Admission amendment

After 12 completed attempts, kv-store-grpc-v1-refined encountered an OpenAI-provider HTTP 503 subscription_sharing_user_unavailable response, then an aborted response. Causation by concurrency is unproven. All other active attempts finished before the controller exited. Reduce admission concurrency from four to two as a precaution; preserve that attempt and its incomplete cost, never retry or replace it.
Completed attempts, including the capacity-affected rejection and incomplete cost, are preserved. Only untouched pending jobs resume at two-way concurrency. The frozen actor runtimes, task limits, prompts, checks and policies are unchanged. Mixed concurrency further limits latency attribution.
