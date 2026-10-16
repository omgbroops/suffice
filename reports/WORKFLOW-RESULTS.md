# Architect-first workflow: final results

The frozen `yaml-workflow-v1` campaign recorded all **27/27 attempts**. All 27 patches passed independent hidden acceptance, visible regression and selected original upstream tests. **26/27 executions completed successfully**; one Sol-worker workflow hit the pre-reset provider quota during review, leaving total cost unknown despite a passing patch. It remains in the results and was not replaced.

The cheaper worker reduced delegation cost, but delegation still cost more than solo Sol on this cohort. There is no accuracy improvement or capability-frontier result here.

| Arm, all at low effort | Completed successful executions | Independently accepted patches | Mean estimated cost | Change from solo | Mean agent seconds |
|---|---:|---:|---:|---:|---:|
| A: Sol, navigation, solo | 9/9 | 9/9 | $0.053521 | baseline | 47.5 |
| B: Sol plans, Sol implements, same parent reviews | 8/9 | 9/9 | $0.128689 | +140.4% | 108.0 |
| C: Sol plans, Luna implements, same parent reviews | 9/9 | 9/9 | $0.081468 | +52.2% | 108.6 |

Cost and latency columns use the same **eight complete-cost task/repetition groups**, excluding mapping-boundaries repetition 1 from every arm because B has incomplete telemetry. Acceptance columns include all nine attempts per arm. Luna reduces cost **36.7% relative to B**, but costs **52.2% more than A**. Latency excludes final external grading, and concurrent PC/provider load prevents a controlled speed claim.

## Where the cost went

| Mean phase estimate, same eight groups | B: Sol worker | C: Luna worker |
|---|---:|---:|
| Sol planning | $0.054296 | $0.058508 |
| Implementation | $0.048677 | $0.002754 |
| Sol review/repair | $0.025716 | $0.020206 |
| Parent share of total | 62.2% | 96.6% |

Cheap implementation worked within the bounded contracts, but the parent alone cost more than the complete solo repair. This supports the user's concern that briefing, planning and review can exceed the work delegated. The source packet was assembled by code; deterministic packet assembly did not remove the model cost of deciding what to include and reviewing the result.

Parent review changed production code in **1/9 Luna workflows** and **0/9 Sol-worker workflows**. In Luna's mapping-boundaries repetition 1, the worker passed visible/upstream tests but failed a declared behavioral check; the parent repaired it and the final independent checks passed. That group is absent from the matched cost means due to B's quota error, but its repair is still counted and disclosed.

One Sol workflow's declared check remained failed after review: folded-tabs repetition 2 used invalid YAML whose initial space-leading content established an incompatible implicit indent. The parent identified that check-input error and ran a corrected public case with explicit indentation, without editing production or the frozen contract. Independent acceptance and upstream regressions passed. **Model-generated tests were imperfect evidence**, and final declared-check status was reported separately under the frozen scoring rule. We did not rewrite the contract or make it a passing test after seeing results.

## Scope and controls

Three pinned historical nodeca/js-yaml tasks, three repetitions and rotated arm order: mapping boundaries, tab-leading folded scalars, and exponent-looking integers. The repository contains about 5,800 TypeScript production lines in 41 files; reference fixes span three, one and six production files. Original task revisions failed behavioral acceptance; reference repairs passed before freeze. Each attempt used independent hidden acceptance, seven visible regression groups and 267/282/279 selected original upstream tests according to revision.

B and C share read-only parent planning, a bounded versioned source packet, a fresh implementation worker, code-executed checks and the same resumed parent review. Only worker model differs. B versus A measures this entire workflow bundle, not context assembly alone. All benchmark actors use low effort. The Pantheon engineering parent's Astra-high setting does not change benchmark settings.

Workflow phases have a larger maximum compute/time allowance than solo. This is a practical total-cost comparison, not an equal-compute capability experiment. All solo patches passed, so the cohort supplies no baseline coding failures to rescue. Public historical repairs may be represented in model training; three issues are not a general benchmark or a statistical superiority claim. Distribution builds, dependency-heavy fuzzing and pathological stress tests are excluded; this is not full repository build/typecheck validation.

## Accounting and verification

Known model usage totals **$2.47958624**, a lower bound because run 010 has unknown total cost; its known portion is $0.1926508. Figures are API-equivalent estimates from the pinned runtime, not subscription charges. They include every recorded phase and failed attempt, but exclude engineering/subagent implementation inference and local test compute. Actual phase/model/usage events are preserved.

The campaign resumed from six saved attempts after the native Pantheon transfer, stopped at the subscription limit after attempt 10, and resumed through the existing `--resume` path after the user reset their allowance. All prior receipts remained intact. Code, configurations, tests and model choices stayed frozen; jobs overlapped with the five isolated research worktrees. These pauses and overlapping jobs limit cache/latency interpretations.

The final parent audit passed: **30 frozen inputs**, **368 baseline files**, all **27 saved attempts**, immutable-file/patch consistency, actual model identities and phase-cost event reconciliation. There were no mismatches. Evidence occupies about 217.8 MiB, within the 350 MiB campaign cap; more than 7 GiB remained free at audit. The frozen implementation had 82 passing harness tests before the campaign. Final acceptance came from executable code outside the repair actors, not their summaries. No model calls were used for this final audit.

Keep solo Sol with navigation as the baseline for these bounded fixes. A future delegation test should use tasks with enough implementation work to amortize parent overhead, with a separately frozen, budget-matched protocol and actual solo failures. These data do not establish that delegation is generally ineffective, or that a different frontier parent will help.

Artifacts: [protocol](../docs/WORKFLOW-EXPERIMENT.md), [per-attempt results](yaml-workflow-v1.md), [full JSON](yaml-workflow-v1.json), [derived metrics](workflow-conclusions.json), [integrity receipt](yaml-workflow-v1-verification.json), and [cross-experiment conclusions](PARALLEL-EXPERIMENTS-RESULTS.md).

Rebuild the frozen report with `node scripts/workflow-report.mjs yaml-workflow-v1`; verify it with `node scripts/verify-workflow.mjs yaml-workflow-v1`. Raw manifests, traces, test logs and patches remain under ignored `.suffice/workflow-runs/yaml-workflow-v1/`.
