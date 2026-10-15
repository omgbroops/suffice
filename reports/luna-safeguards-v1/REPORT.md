# Luna-low safeguards versus Luna-xhigh

Completed 30/30 declared attempts. Known actor inference $0.216211; unknown-cost cells: 0.

A = unchanged Luna-low; B = Luna-low plus public verification/preservation/pre-edit probe; C = unchanged Luna-xhigh.

| Arm | Accepted | Budget-eligible | Known inference | Unknown totals | Model replies | Repairs | Pre-edit probes observed |
|---|---:|---:|---:|---:|---:|---:|---:|
| A | 2/10 | 2 | $0.036279 | 0 | 109 | 0 | 0 |
| B | 3/10 | 3 | $0.044845 | 0 | 131 | 5 | 9 |
| C | 7/10 | 7 | $0.135087 | 0 | 177 | 0 | 0 |

| Task | Arm | Status | Accepted | API-equivalent USD | Replies | Public gate outcomes |
|---|---|---|---:|---:|---:|---|
| s01 | A | completed | False | 0.002577 | 8 |  |
| s01 | B | completed | False | 0.004112 | 16 | initial:False, after-repair:False |
| s01 | C | completed | True | 0.021199 | 28 |  |
| i01 | B | completed | False | 0.004600 | 10 | initial:False, after-repair:False |
| i01 | C | completed | False | 0.007569 | 12 |  |
| i01 | A | completed | False | 0.003257 | 10 |  |
| q04 | C | completed | True | 0.015472 | 26 |  |
| q04 | A | completed | False | 0.003142 | 10 |  |
| q04 | B | completed | False | 0.003104 | 12 | initial:True |
| i03 | A | completed | False | 0.003864 | 10 |  |
| i03 | B | completed | False | 0.002449 | 9 | initial:True |
| i03 | C | completed | True | 0.012234 | 18 |  |
| s02 | B | completed | True | 0.003149 | 11 | initial:True |
| s02 | C | completed | True | 0.017428 | 18 |  |
| s02 | A | completed | True | 0.003877 | 13 |  |
| s03 | C | completed | False | 0.009419 | 13 |  |
| s03 | A | completed | False | 0.004251 | 14 |  |
| s03 | B | completed | False | 0.002582 | 10 | initial:True |
| i02 | A | completed | True | 0.004495 | 9 |  |
| i02 | B | completed | True | 0.004562 | 13 | initial:False, after-repair:False |
| i02 | C | completed | True | 0.006660 | 11 |  |
| i04 | B | completed | False | 0.004221 | 10 | initial:True |
| i04 | C | completed | True | 0.012146 | 12 |  |
| i04 | A | completed | False | 0.003650 | 12 |  |
| q01 | C | completed | True | 0.011390 | 16 |  |
| q01 | A | completed | False | 0.002846 | 11 |  |
| q01 | B | completed | False | 0.007858 | 20 | initial:False, after-repair:False |
| q02 | A | completed | False | 0.004321 | 12 |  |
| q02 | B | completed | True | 0.008209 | 20 | initial:False, after-repair:False |
| q02 | C | completed | False | 0.021570 | 23 |  |

Development reuse of original ten issues; not heldout.
One new observation per task/arm, repository correlation and possible training exposure.
B bundles three changes; activation does not identify causal component effects.
Public check/probe correctness requires review; passing it is not hidden acceptance.
Frozen grader limitations and native timing sensitivity from original experiment still apply.
Controls are reused exact-source receipts, not newly executed controls.
Engineering inference and preparation overhead excluded; API-equivalent estimates are not actual subscription charges.

Frozen input mismatches: []. Variant hash mismatches: {'A': [], 'B': [], 'C': []}.

All initial/final patches, public gate output, raw usage, failed responses, actor test edits and independent original/native/private grading are retained. No promotion or further campaign follows automatically.
