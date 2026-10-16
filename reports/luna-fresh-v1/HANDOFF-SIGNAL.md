# Cheap Luna-to-Sol handoff signal investigation

Decision: do not deploy a router. This investigation found a useful narrow warning, not a reliable detector of Luna's silent mistakes.

The rule was frozen in plan.json before fresh outcomes: original PUBLIC regression checks fail, OR worker did not complete operationally, OR no production patch was submitted. No hidden tests, reference patch, grader outcome, confidence judge, embedding model or extra inference feeds the decision. Public checks consumed 105.4 seconds total on Sonion across the six A attempts; this is wall time, not inferred dollars. They are already logged independently. Their use as a deployed terminal gate would still add latency.

Fresh A: zero flags in six attempts. Five contract-valid primary tasks pass. The sixth, fastq88, has a disputed Promise.all scheduling assertion; its patch produces the original reported expected trace in 10/10 separate checks. There are zero CONFIRMED fresh failures on which to estimate recall. Zero flags is not proof the signal is safe, and the disputed raw negative must not be mislabeled a missed genuine failure.

Development reuse only: the old xhigh C cohort has one flag (q02) among three frozen-grader failures. i01 and s03 pass original public tests despite frozen private failures. The old s01 frozen pass has an additional known posthoc regression that is also unflagged. Thus the rule misses real-looking semantic problems. The single flagged negative and zero observed false positives are far too few to establish reliable precision.

Cost replay, NOT a live handoff: prior Luna-xhigh ten-task cost was $0.13508742. The recorded standalone Sol run on the sole flagged q02 cost $0.06515280, producing a hypothetical sum $0.20024022, +48.23%. This combines different sessions, cache conditions and allowances; it is neither a measured continuation cost nor an upper/lower bound. A Sol continuation might be cheaper or more expensive. No new Sol call was made because the frozen rule did not flag the fresh tasks.

For a terminal policy, if Luna average cost is C, success probability p, routing fraction q, extra Sol cost per routed task S, and net additional success probability d, equal cost per accepted task requires q*S <= C*d/p. The signal's false positives, failed rescues and regressions all reduce the permissible spend. Finding a free classifier does not make the Sol call free.

Smallest justified decision: keep Luna Extra High as the candidate baseline. Do not add confidence classification, learned routing or another review-model call. The cheap public-failure signal can justify looking at an observed failing check, but cannot establish completion when all checks pass. A future handoff claim needs genuine task-contract failures, a signal frozen before their labels, and measured combined Luna+Sol cost including failed rescues. This campaign does not establish that claim.


Post-campaign treatment diagnostic (not held-out signal validation): f01/B triggered one continuation on a 299.921717 ms observation against a 300 ms lower bound. A-final, B-initial and B-final library hashes are identical. One independent grade accepted these bytes and another rejected them on the same timing bound. The continuation cost $0.00274778 and four replies, with no changed patch paths. This is direct evidence against treating any one public-test failure as a reliable coding-failure signal. A confirmation rerun may help diagnose noise, but no confirmation policy or Sol routing was evaluated or deployed.
