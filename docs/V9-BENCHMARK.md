# v9 benchmark protocol

Compare four arms using the same native Codex CLI, task snapshots, public checks, per-attempt allowance and deadline:

| Arm | Behavior |
| --- | --- |
| luna | One Luna implementation, high effort |
| sol | One Sol implementation, high effort |
| ladder | Luna, then one Sol takeover only on failing public checks |
| v9 | Luna, independent Sol tests/arbitration, bounded Luna repair, selective Sol takeover |

The full treatment bundles multiple mechanisms. A benefit would require later ablations to attribute it. All stages count toward total cost and latency. No model substitution or silent retries are permitted. A fresh CLI invocation is used for every stage.

## Freeze, execute, grade

A public manifest contains an id, seed, repetitions, explicit limits (`maxCostUsd`, `timeoutMs`, `overallCostUsd`) and tasks. Each task provides an id, a standalone Git workspace, a public prompt, checks, optional interface/protected paths and up to four argv setup commands. No evaluator field is accepted. The development pilot materializer supplies an example.

```powershell
npm run v9:preflight
node scripts/v9-pilot.mjs C:/work/new-v9-pilot
node scripts/v9-bench.mjs plan C:/work/new-v9-pilot/public-manifest.json C:/work/new-v9-pilot/plan
node scripts/v9-bench.mjs run C:/work/new-v9-pilot/plan
# Only after execution-complete.json exists, introduce an external evaluator config.
node scripts/v9-bench.mjs grade C:/work/new-v9-pilot/plan C:/work/private-evaluators.json
node scripts/v9-report.mjs C:/work/new-v9-pilot/plan
```

`plan` freezes public source, runtime hashes, Node and CLI versions, models, efforts, seed and a paired, interleaved four-arm schedule. It refuses plan directories inside source repositories. `run` creates fresh task copies; declared setup may install ignored dependencies but cannot alter public source. Each attempt and all costs, including failures, are retained. Unknown usage stops the campaign. The campaign reserves a full per-attempt allowance before starting each actor; observed response overshoots are retained. `execution-started.json` prevents reusing a campaign for another execution.

`grade` refuses to load evaluator configuration until all scheduled attempts are terminal. It verifies schedule identity and selected source hashes, copies sealed final artifacts, then invokes external argv graders. Evaluator JSON has `checks: {"task-id": ["node", "C:/private/grader.mjs", "{workspace}"]}` and optional `timeoutMs`. Graders must arrange any required grading dependencies and distinguish infrastructure problems. They never feed back into execution. Missing/time-limited grading remains ungraded, rather than a pass.

These phases enforce data flow in the harness. Native local filesystem access is not an OS-enforced private-test boundary. For a local engineering pilot, introduce evaluator files only after every actor has stopped. For publishable held-out results, run actors and evaluators in independently isolated environments, freeze evaluator receipts with a trusted custodian before execution, and disclose that isolation. Never run another actor against the same scored cohort after inspecting its private failures.

## Report honestly

Report acceptance rate, cost per accepted task (including failed work), latency, takeover rate, unknown usage, ungraded cases and policy-valid acceptance. Unknown-cost campaigns cannot yield an exact cost-per-acceptance number. Keep API-equivalent estimates separate from subscription billing. Publish model/CLI/runtime/source versions, efforts, public-check provenance, frozen schedule, per-attempt status and raw receipt hashes. Cache warmth is observed, not controlled.

The first live pilot has a user-approved $10 API-equivalent cap. Its two authored JavaScript tasks are development fixtures for wiring and failure-path validation. It cannot establish v9 superiority or represent general software engineering. Evaluators authored afterward validate outputs but are not preregistered held-out evidence.

Next efficacy campaign: at least 50 previously unseen tasks spanning real repositories and languages, frozen without tuning against their private results, paired across all four arms. Include setup-heavy tasks and failures of public tests, not only small pure functions. Preregister limits, scoring and uncertainty reporting. If reusing a public benchmark with known test exposure, label it separately from unseen evaluation.

Earlier Claude scores are historical context. The poly36 35/36 result used hidden-oracle retry feedback and a contaminated set; it is not comparable with this deferred-grading protocol. The handoff's 22/27 v8 combination was stitched across runs. Neither is an oracle-free v9 baseline. Do not pool Pi, Claude and native Codex results or claim model equivalence from their labels.
