# HarnessTax Sol 6.1 single round

Completed: 55/120 attempts. Interim; not a final comparison.

| Arm | Completed | Accepted | Policy valid | Known cost (USD) | Unknown costs | Mean agent seconds |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| codex | 13/30 | 11 | 11 | 1.895664 | 1 | 139.0 |
| pi | 14/30 | 12 | 12 | 1.875665 | 0 | 253.7 |
| v1 | 14/30 | 12 | 11 | 1.664412 | 2 | 248.5 |
| v2 | 14/30 | 9 | 9 | 0.104250 | 0 | 210.2 |

API-equivalent cost estimates, not subscription charges. Unknown costs remain unknown.
One attempt per task/arm; no replacement runs. All errors and failures remain in the denominator.
Latency is the full Harbor agent phase, including wrapper/runtime startup and receipt export. Worker-only timings are also retained in results.json.
The Pi adaptive-rejection-sampler actor and grader completed before a host interruption during artifact collection. Original receipts were recovered and hash checked against its container; outer phase timing is missing. No actor or grader rerun.
After the first two attempts, concurrency is at most two, with a combined 4 GiB task reservation; tasks above 2 GiB run alone. Shared resources may affect latency.
After attempt 55, actor receipts are bind-mounted to the host so timeout cancellation cannot skip export. Timed-out actors are stopped before grading; timeout failures remain in the denominator and incomplete costs remain unknown. No retries.
V2 changes model as well as pipeline. Codex/Pi/V1 match Sol High; V2 is a system comparison.
100-response cap; first provider-failed attempt had the initial 60 cap but made zero responses.
V2 controller smoke checks cover 3/30 tasks, solely from public instructions. Other tasks have no controller verification trigger.
No private grader feedback is used for Sol escalation. Passing a public smoke check does not establish correctness.
Source and dependency pins, full cohort, limits and preflight are in manifest.json, preflight.json and benchmark/harnesstax-plan.md.
Historical Pi $0.420517/attempt was GPT-5.6-Sol High with three repetitions and is not this run's control.

Sol advice calls: 0; repairs: 0; takeovers: 0.
