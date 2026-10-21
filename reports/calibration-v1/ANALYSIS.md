# Calibration analysis

Completed: 32/32. Final.

| Arm | Accepted / completed | Known USD | USD / accepted | Mean seconds | Output tokens | Visible text chars | Sol calls | Repairs | Takeovers |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| pi | 3/4 | 0.511380 | 0.170460 | 193.8 | 27997 | 2431 | 0 | 0 | 0 |
| v1-original | 3/4 | 0.328936 | 0.109645 | 134.7 | 20285 | 2993 | 0 | 0 | 0 |
| v1-refined | 3/4 | 0.646851 | 0.215617 | 230.0 | 35896 | 3588 | 0 | 0 | 0 |
| v1-concise | 3/4 | 0.419222 | 0.139741 | 156.8 | 24207 | 2532 | 0 | 0 | 0 |
| v2-alone | 3/4 | 0.009995 | 0.003332 | 68.4 | 8965 | 966 | 0 | 0 | 0 |
| v2-upfront | 2/4 | 0.020052 | 0.010026 | 77.9 | 9616 | 4242 | 4 | 0 | 0 |
| v2-selective | 2/4 | 0.009873 | 0.004936 | 62.4 | 8207 | 956 | 0 | 0 | 0 |
| v2-concise | 2/4 | 0.009970 | 0.004985 | 73.6 | 9183 | 1162 | 0 | 0 | 0 |

## Matched comparisons

Task order and arm policies were frozen before inference. Every selected failed attempt remains in cost denominators. User-authorized provider-interruption originals are excluded separately. Partial or unknown costs are floors.

v1-original versus pi: 4 matched tasks, known cost floors $0.328936 versus $0.511380; accepted-outcome wins (including infrastructure effects): none; regressions: none.
Fully accounted matched pairs: 4/4; costs $0.328936 versus $0.511380. Excluded from this accounting-only comparison: none. All outcomes remain in the table and overall denominator.
On these accounting pairs, cost change: -35.68%; wall-time change across 4 timed pairs: -30.51%. These are observed changes, with shared-host and provider contention.

v1-refined versus v1-original: 4 matched tasks, known cost floors $0.646851 versus $0.328936; accepted-outcome wins (including infrastructure effects): none; regressions: none.
Fully accounted matched pairs: 4/4; costs $0.646851 versus $0.328936. Excluded from this accounting-only comparison: none. All outcomes remain in the table and overall denominator.
On these accounting pairs, cost change: +96.65%; wall-time change across 4 timed pairs: +70.78%. These are observed changes, with shared-host and provider contention.

v1-concise versus v1-refined: 4 matched tasks, known cost floors $0.419222 versus $0.646851; accepted-outcome wins (including infrastructure effects): none; regressions: none.
Fully accounted matched pairs: 4/4; costs $0.419222 versus $0.646851. Excluded from this accounting-only comparison: none. All outcomes remain in the table and overall denominator.
On these accounting pairs, cost change: -35.19%; wall-time change across 4 timed pairs: -31.84%. These are observed changes, with shared-host and provider contention.

v2-upfront versus v2-alone: 4 matched tasks, known cost floors $0.020052 versus $0.009995; accepted-outcome wins (including infrastructure effects): none; regressions: db-wal-recovery.
Fully accounted matched pairs: 3/4; costs $0.013640 versus $0.005431. Excluded from this accounting-only comparison: filter-js-from-html. All outcomes remain in the table and overall denominator.
On these accounting pairs, cost change: +151.17%; wall-time change across 3 timed pairs: +35.27%. These are observed changes, with shared-host and provider contention.

v2-selective versus v2-alone: 4 matched tasks, known cost floors $0.009873 versus $0.009995; accepted-outcome wins (including infrastructure effects): none; regressions: kv-store-grpc.
Fully accounted matched pairs: 3/4; costs $0.005337 versus $0.005431. Excluded from this accounting-only comparison: filter-js-from-html. All outcomes remain in the table and overall denominator.
On these accounting pairs, cost change: -1.73%; wall-time change across 3 timed pairs: -6.77%. These are observed changes, with shared-host and provider contention.

v2-selective versus v2-upfront: 4 matched tasks, known cost floors $0.009873 versus $0.020052; accepted-outcome wins (including infrastructure effects): db-wal-recovery; regressions: kv-store-grpc.
Fully accounted matched pairs: 3/4; costs $0.005337 versus $0.013640. Excluded from this accounting-only comparison: filter-js-from-html. All outcomes remain in the table and overall denominator.
On these accounting pairs, cost change: -60.88%; wall-time change across 3 timed pairs: -31.08%. These are observed changes, with shared-host and provider contention.

v2-concise versus v2-selective: 4 matched tasks, known cost floors $0.009970 versus $0.009873; accepted-outcome wins (including infrastructure effects): kv-store-grpc; regressions: db-wal-recovery.
Fully accounted matched pairs: 3/4; costs $0.006855 versus $0.005337. Excluded from this accounting-only comparison: filter-js-from-html. All outcomes remain in the table and overall denominator.
On these accounting pairs, cost change: +28.46%; wall-time change across 3 timed pairs: +44.03%. These are observed changes, with shared-host and provider contention.

## Verification gaps

Independent grades are observed only after actor shutdown and never fed into routing. A passed partial public check can therefore leave a real defect undetected. This is a coverage limit, not evidence that assistance was unnecessary.

| Arm | Independent failures after public pass | Public failures | Unavailable / not run |
| --- | ---: | ---: | ---: |
| pi | 1 | 0 | 0 |
| v1-original | 1 | 0 | 0 |
| v1-refined | 1 | 0 | 0 |
| v1-concise | 1 | 0 | 0 |
| v2-alone | 0 | 0 | 0 |
| v2-upfront | 1 | 0 | 0 |
| v2-selective | 1 | 0 | 0 |
| v2-concise | 2 | 0 | 0 |

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
| kv-store-grpc | v1-concise | pass | passed | completed | 0.033176 |
| kv-store-grpc | v2-alone | pass | passed | completed | 0.001985 |
| kv-store-grpc | v2-upfront | pass | passed | completed | 0.004965 |
| kv-store-grpc | v2-selective | fail | passed | completed | 0.002653 |
| kv-store-grpc | v2-concise | pass | passed | completed | 0.002457 |
| kv-store-grpc | pi | pass | passed | completed | 0.033640 |
| filter-js-from-html | v1-concise | fail | passed | completed | 0.323300 |
| filter-js-from-html | v2-alone | ungraded | passed | completed | 0.004564 |
| filter-js-from-html | v2-upfront | ungraded | passed | completed | 0.006412 |
| filter-js-from-html | v2-selective | ungraded | passed | completed | 0.004536 |
| filter-js-from-html | v2-concise | fail | passed | completed | 0.003114 |
| filter-js-from-html | pi | fail | passed | completed | 0.428056 |
| filter-js-from-html | v1-original | fail | passed | completed | 0.234408 |
| db-wal-recovery | v1-concise | pass | passed | completed | 0.038264 |
| db-wal-recovery | v2-alone | pass | passed | completed | 0.001240 |
| db-wal-recovery | v2-upfront | fail | passed | completed | 0.004630 |
| db-wal-recovery | v2-selective | pass | passed | completed | 0.001296 |
| db-wal-recovery | v2-concise | fail | passed | completed | 0.003315 |
| db-wal-recovery | pi | pass | passed | completed | 0.021205 |
| db-wal-recovery | v1-original | pass | passed | completed | 0.031318 |
| db-wal-recovery | v1-refined | pass | passed | completed | 0.035048 |
| kv-store-grpc | v1-refined | pass | passed | completed | 0.032324 |
| filter-js-from-html | v1-refined | fail | passed | completed | 0.539582 |

API-equivalent estimates, not subscription charges. Full stage costs, cache tokens, calls, identity and receipt reconciliation are in results.json. Visible text is measured in characters, not billed tokens; reasoning and tool arguments can dominate output cost.
Four purposively chosen tasks and one attempt per configuration cannot establish population accuracy or robust causal gains. V1 scope and repair are a bundle; V2 assistance arms compare routing policies with the rest of the core held fixed. Concise changes instructions only.
At most four containers share the host; observed-memory admission may reduce overlap. Shared CPU, network, caching and grading contention limit latency comparisons. No JS/TS source task measures the AST-navigation advantage.
Required product state is not classified as an optional prerequisite. Missing checker infrastructure remains unverified, never accepted by the controller. Independent grading remains separate and cannot trigger assistance.
No global skills, arbitrary compaction or default changes. Original campaign reports and runtime receipts remain preserved.

## Provider-interruption replacement amendment

The user explicitly requested one fresh replacement for each of two interrupted refined-V1 attempts, before replacement outcomes. Those originals are removed from the main comparison, including its costs and latency. Each replacement counts regardless of outcome; there is no fallback to an original or repeat-until-pass.
Selected comparison known cost: $1.95627824. Excluded originals known cost floor: $0.02495760. Total actual campaign usage floor: $1.98123584, with 2 incomplete costs.
All excluded receipts remain listed in results.json. The frozen runtime, task requirements, public checks, models and effort are unchanged. Later retries and differing service conditions further limit causal comparisons.

## Admission amendment

After 12 completed attempts, kv-store-grpc-v1-refined encountered an OpenAI-provider HTTP 503 subscription_sharing_user_unavailable response, then an aborted response. Causation by concurrency is unproven. All other active attempts finished before the controller exited. Reduce admission concurrency from four to two as a precaution; preserve that attempt and its incomplete cost, never retry or replace it.
Completed attempts, including the capacity-affected rejection and incomplete cost, are preserved. Only untouched pending jobs resume at two-way concurrency. The frozen actor runtimes, task limits, prompts, checks and policies are unchanged. Mixed concurrency further limits latency attribution.

## Grading-overlap scheduling amendment

Following observed browser-grader resource exhaustion and repeated 900-second verifier timeouts, remaining trials use at most two active model jobs and four total task containers. A complete known-cost worker receipt releases its model slot while the official grader continues. Existing trials were adopted without restart; only untouched frozen jobs are admitted.
The previous admission controller was drained with an owned handoff stop. Quota, observed-memory and spending guards remain. Frozen model policies, checks, grading rules, timeouts and per-container CPU/memory limits are unchanged. The model/grading overlap changes contention and further limits latency comparisons.
Resource metadata showed an OOM flag and roughly 240 Chromium processes in one 2 GiB grader container. This suggests resource exhaustion, but does not establish whether browser cleanup, candidate behavior or another cause is responsible. No private grader cases were inspected or altered.
