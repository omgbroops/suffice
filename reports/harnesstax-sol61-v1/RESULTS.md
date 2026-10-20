# HarnessTax Sol 6.1 single round

Completed comparison slots: 90/120. Interim; not a final comparison.

| Arm | Completed | Graded | Accepted | Policy valid | Known cost (USD) | Unknown costs | Mean agent seconds |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| codex | 22/30 | 22 | 18 | 18 | 3.597580 | 1 | 153.6 |
| pi | 22/30 | 22 | 20 | 20 | 2.641470 | 0 | 217.8 |
| v1 | 23/30 | 23 | 20 | 19 | 2.337142 | 2 | 196.3 |
| v2 | 23/30 | 23 | 15 | 15 | 0.139013 | 0 | 186.9 |

Six infrastructure replacements were authorized before their outcomes. Pending replacements: 0.
Excluded originals: 6; completed executions including excluded: 96.
Selected comparison known cost: $8.715205; excluded infrastructure known cost: $0.223056; total known campaign spend including excluded: $8.938261.
Excluded originals do not count toward comparison accuracy, cost per task, or latency. Their receipts and costs remain in the audit trail and total spend. Replacement failures count; no outcome-based fallback to originals.

API-equivalent cost estimates, not subscription charges. Unknown costs remain unknown.
One selected attempt per task/arm. Only the six preselected, ungraded permissions failures are replaced at the user's request; all other original failures remain in the comparison.
Latency is the full Harbor agent phase, including wrapper/runtime startup and receipt export. Worker-only timings are also retained in results.json.
The Pi adaptive-rejection-sampler actor and grader completed before a host interruption during artifact collection. Original receipts were recovered and hash checked against its container; outer phase timing is missing. No actor or grader rerun.
After the first two attempts, concurrency is at most two, with a combined 4 GiB task reservation; tasks above 2 GiB run alone. Shared resources may affect latency.
After attempt 55, actor receipts are bind-mounted to the host so timeout cancellation cannot skip export. Timed-out actors are stopped before grading; timeout failures remain in the denominator and incomplete costs remain unknown. No retries.
A receipt permissions error prevented grading for six V1/V2 attempts. Those originals remain in the audit trail. The adapter now reads private receipts as root inside the container before host ownership cleanup.
V2 changes model as well as pipeline. Codex/Pi/V1 match Sol High; V2 is a system comparison.
100-response cap; first provider-failed attempt had the initial 60 cap but made zero responses.
V2 controller smoke checks cover 3/30 tasks, solely from public instructions. Other tasks have no controller verification trigger.
No private grader feedback is used for Sol escalation. Passing a public smoke check does not establish correctness.
Source and dependency pins, full cohort, limits and preflight are in manifest.json, preflight.json and benchmark/harnesstax-plan.md.
Historical Pi $0.420517/attempt was GPT-5.6-Sol High with three repetitions and is not this run's control.

Sol advice calls: 0; repairs: 0; takeovers: 0.
