# Five-task refinement pilot assessment

One attempt per task/arm on five purposively selected fresh tasks. These are system comparisons, not feature ablations or reliable population accuracy estimates. No previous result is replaced.

| Arm | Accepted | Graded | Policy valid | Public checks passed | Known total USD | Known cost / accepted | Mean agent seconds | Incomplete costs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| pi | 5/5 | 5 | 5/5 | 4/5 | 0.361767 | 0.072353 | 113.1 | 0 |
| v1 | 5/5 | 5 | 5/5 | 5/5 | 0.528452 | 0.105690 | 133.9 | 0 |
| v2 | 4/5 | 5 | 4/5 | 4/5 | 0.060584 | 0.015146 | 123.6 | 0 |
| v3 | 4/5 | 5 | 4/5 | 4/5 | 0.251892 | 0.062973 | 240.2 | 0 |

All known costs include failures, planning, delegation and repairs. These are API-equivalent estimates, not subscription charges. Incomplete accounting is retained as a floor, never silently zeroed.

| Task | Pi | V1 | V2 | V3 |
| --- | --- | --- | --- | --- |
| cancel-async-tasks | pass | pass | pass | pass |
| cobol-modernization | pass | pass | pass | pass |
| custom-memory-heap-crash | pass | pass | pass | pass |
| modernize-scientific-stack | pass | pass | pass | pass |
| polyglot-c-py | pass | pass | fail | fail |

## Per-task cost and latency

Each cell is whole-attempt known USD / agent seconds; incomplete costs carry a ≥ prefix. Setup and independent grading are excluded from agent latency.

| Task | Pi | V1 | V2 | V3 |
| --- | --- | --- | --- | --- |
| cancel-async-tasks | $0.037308 / 69.3s | $0.033544 / 57.1s | $0.004454 / 56.7s | $0.030458 / 220.0s |
| cobol-modernization | $0.169888 / 260.3s | $0.311720 / 357.0s | $0.007433 / 114.9s | $0.091226 / 512.1s |
| custom-memory-heap-crash | $0.060365 / 86.4s | $0.060588 / 82.6s | $0.010598 / 181.8s | $0.069607 / 186.5s |
| modernize-scientific-stack | $0.030877 / 45.1s | $0.032219 / 27.3s | $0.004234 / 30.0s | $0.022981 / 49.8s |
| polyglot-c-py | $0.063328 / 104.6s | $0.090380 / 145.7s | $0.033866 / 234.7s | $0.037620 / 232.5s |

## Assistance and delegation

v2: 5 advisory/planning stages; 1 repair counter; 1 takeovers; 0 delegations.
- gpt-6.1-sol: known stage cost $0.036626.
- gpt-6-luna: known stage cost $0.023958.
v3: 0 advisory/planning stages; 2 repair counter; 0 takeovers; 8 delegations.
- gpt-6.1-sol: known stage cost $0.213160.
- gpt-6-luna: known stage cost $0.038732.

Largest recorded V3 coordinator input context: 22,801 tokens. No compaction treatment was enabled or tested.

## Regressions against the same-task Pi control

v1: Pi-only successes: none; arm-only successes: none.
v2: Pi-only successes: polyglot-c-py; arm-only successes: none.
v3: Pi-only successes: polyglot-c-py; arm-only successes: none.

## Public-check disagreements

pi: public pass but independent failure: none; public failure but independent acceptance: polyglot-c-py.
v1: public pass but independent failure: none; public failure but independent acceptance: none.
v2: public pass but independent failure: none; public failure but independent acceptance: none.
v3: public pass but independent failure: none; public failure but independent acceptance: none.

## Interpretation limits

Every arm receives the original task and identical visible public check command. Suffice controller feedback/repair is an explicit treatment; Pi receives no extra post-completion model turn. A public check pass covers only its published assertions.
V1 changes scope guidance and public repair. V2 additionally changes model, preparation/output behavior and upfront planning. V3 changes orchestration and the model mix. This run cannot attribute a difference to any single component.
Four sequential V3 delegations are allowed. Only Luna has implementation/shell tools; Sol can inspect source and fixed verification evidence and retrieve original worker output. Worker summaries alone are not accepted as verification.
One shared budget per attempt includes all stages. Parent V3 elapsed time contains nested worker time; stage elapsed times must not be added. At most two task containers share this host, so latency can include resource contention.
The selected cohort has no JavaScript/TypeScript tasks and does not measure the value of Suffice's JavaScript/TypeScript AST navigation. Public smoke checks were authored before actor inference; their coverage is partial and explicitly reported.
The polyglot task image lacks system python3. The preflight provided a separate checker interpreter, but the frozen public check invokes system python3 for the candidate. Pi was independently accepted despite that public check reporting a missing interpreter. This check conflates environment readiness with source correctness and can cause unnecessary installation or repair work. Preserve this discrepancy; do not count it as a demonstrated code defect or silently amend this cohort. A follow-up should distinguish unavailable prerequisites from failing candidate behavior.
V1's polyglot initial controller check failed solely with the missing-python3 diagnostic; its subsequent same-model repair cost $0.031034 and passed the check. This is observed environment-repair overhead, not evidence that the original source needed a correctness repair.
No production defaults were changed. Select a follow-up on fresh tasks based on failure mechanisms and cost per accepted task; do not promote an experimental mode solely from five outcomes.
