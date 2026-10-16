# Failure recovery: post-reset pilot

The six-attempt frozen pilot completed. Normal iterative repair passed **1/3**, and the checkpoint/rollback arm passed **1/3**. **No live rollback occurred**, so this does not establish rollback efficacy or a capability improvement.

The immutable-finalizer task failed independent hidden acceptance in both repetitions of both arms, despite passing visible regression checks. The aliased-merge task passed once in each arm. These are genuine completed coding failures, unlike the four preserved pre-reset provider-limit failures. The visible-state trigger did not activate strongly enough to address the missed hidden requirements; hidden results were never fed back to the agents.

| Arm | Independent acceptance | Rollbacks | Total estimated model cost |
|---|---:|---:|---:|
| Normal | 1/3 | 0 | $0.1912624 |
| Checkpoint/rollback | 1/3 | 0 | $0.2288344 |

Costs include failed repairs. They are API-equivalent estimates, not subscription charges. With no active rollbacks and this small screened cohort, the cost difference cannot establish a recovery-policy cost frontier. Post-reset known cost was $0.4200968; including the preserved pre-reset lower bound gives **$0.4638552 known**, with four historical totals still unknown. Engineering/subagent implementation work is outside these benchmark usage estimates.

A read-only parent audit checked 37 frozen inputs/current copies, 312 baseline files, 452 unchanged workspace files, and ten saved patch entries, with no mismatch. All six result records report the intended Sol identity and intact immutable files. The audit did not rerun generated source or make inference calls. See [receipt](recovery-postreset-parent-audit.json).

The engineering subagent's turn was stopped by an automatic content-safety check. Its already-running, frozen six-attempt pilot completed normally; the blocked action was not retried. The prepared LRU follow-up and a larger scored recovery campaign were not launched. This is an additional scope limitation, not a benchmark coding failure.

The branch remains isolated at `C:/Users/Mohammed/Documents/GitHub/suffice-experiments/failure-recovery`. Detailed current records are in its `reports/recovery-pilot-post-reset-v2.json`; frozen source, manifests and traces are in `.suffice/recovery-runs/pilot-post-reset-v2/`. The v1 provider-limited report is historical and remains unchanged. Nine focused checks had passed before the live v2 pilot. A broad inherited test failure was isolated to a pre-existing CRLF-sensitive synthetic reference replacement, not this recovery policy.

Recommendation: do not enable automatic rollback by default from this evidence. The pilot exposes a verification gap: a policy watching only observed failures cannot reliably react to a requirement the agent never tests. Additional work would need a separately frozen design and held-out cases; do not tune against these hidden failures and call the same cases a holdout.
