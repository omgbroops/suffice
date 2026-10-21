# Primary comparison: authorized timeout replacements

The two original 600-second timeouts are excluded from primary accuracy, latency, and cost totals. Their receipts and spend remain in the audit below. Each replacement is selected regardless of its outcome; no retry-until-pass.

| Arm | Finished | Accepted | Policy-valid successes | Known USD | Unknown costs |
| --- | ---: | ---: | ---: | ---: | ---: |
| alone | 2/6 | 2 | 2 | 0.012510 | 0 |
| review | 1/6 | 1 | 1 | 0.008187 | 0 |
| pi | 1/6 | 1 | 1 | 0.093634 | 0 |

## Excluded timeout originals

- queue-aborted-review: AgentTimeoutError, known cost floor $0.01757962.
- queue-aborted-pi: AgentTimeoutError, known cost floor $0.25152560.

All executed attempts, including excluded originals: known cost floor $0.38343660; 2 incomplete cost records.

The completed Luna-alone attempt on the first issue retains its original 600-second cap (finished in 325.198 seconds); all other primary attempts use 1,800 seconds. The remaining five issues are the fully matched time-budget cohort. These are issue-contract checks, not proof of complete correctness.
