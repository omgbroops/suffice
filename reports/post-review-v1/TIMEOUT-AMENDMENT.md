# User-authorized timeout amendment

The initial three attempts on `queue-aborted` used a 600-second agent limit.
Luna alone completed in 325.198 seconds. The review and stock Pi attempts
reached Harbor's outer timeout. All three resulting patches passed the frozen
issue-contract grader, but the two interrupted runs are not policy-valid
completed successes. Their terminal aggregate receipts are missing.

On October 20, the user asked to remove or increase the ten-minute limit.
The remaining 15 previously authorized attempts now use 1,800 seconds for
both Harbor's agent override and the actor's shared solve/review/repair budget.
The frozen task files, images, runtime, prompts, graders, models, $1 allowance,
100-response limit, 240-tool limit, and two-way concurrency remain unchanged.
Sol's own review remains bounded to 60 seconds and $0.03 within that allowance.

`campaign/timeout-amendment.json` records the original manifest hash and exact
completed attempts retained. Explicit resume skips those completed attempts
and refuses to overwrite any partial trial. There are no replacement runs.
The first issue is a separate 600-second diagnostic cohort; the remaining
five issues form the matched 1,800-second comparison. Do not present a pooled
six-issue result as if every attempt had the same time allowance.

Recovered assistant receipts give API-equivalent cost floors of $0.01757962
for the interrupted review run and $0.25152560 for interrupted Pi. Missing
terminal aggregates remain an accounting limitation; request/reply counts
alone do not prove a complete bill. The original receipts and outcomes are
preserved. Reporting now shows these floors rather than misleading $0 costs,
and records the Sol review call and single Luna repair stage that actually ran.

Sol Low returned two correction requests in 7.676 seconds, costing $0.004718.
The repair stage was still active at the outer timeout. No grader details or
previous outcomes are supplied to the remaining actors.
