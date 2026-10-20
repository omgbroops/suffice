# HarnessTax Sol 6.1 single round

Completed comparison slots: 96/120. Interim; not a final comparison.

| Arm | Completed | Graded | Accepted | Policy valid | Known cost (USD) | Unknown costs | Mean agent seconds |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| codex | 24/30 | 24 | 20 | 20 | 3.931973 | 1 | 161.0 |
| pi | 24/30 | 24 | 22 | 22 | 2.798678 | 0 | 213.7 |
| v1 | 24/30 | 24 | 21 | 21 | 2.455075 | 1 | 198.2 |
| v2 | 24/30 | 24 | 16 | 16 | 0.142795 | 0 | 186.7 |

Six infrastructure replacements were authorized before their outcomes. Pending replacements: 0.
Excluded originals: 6; completed executions including excluded: 102.
Selected comparison known cost: $9.328521; excluded infrastructure known cost: $0.223056; total known campaign spend including excluded: $9.551577.
Excluded originals do not count toward comparison accuracy, cost per task, or latency. Their receipts and costs remain in the audit trail and total spend. Replacement failures count; no outcome-based fallback to originals.

API-equivalent cost estimates, not subscription charges. Unknown costs remain unknown.
An offline accounting audit reconciled all eight financial-document-processor / V1 responses at $0.186490. Its former unknown flag came from splitting JSONL on legal Unicode characters inside tool output; no usage or evaluator score changed. See cost-accounting-audit.json.
Two original costs remain unconfirmed: Codex adaptive-rejection-sampler failed in routing discovery with zero recorded model responses; V1 make-doom-for-mips lost receipts on its early outer timeout. Neither is treated as confirmed zero spend.
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
