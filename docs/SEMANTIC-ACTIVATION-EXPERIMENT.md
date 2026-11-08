# Activated navigation experiment v2

The first availability-only experiment produced zero specialized-navigation calls. This second campaign explicitly tests the requested four workflows, retaining the three task snapshots, model (gpt-6.1-sol), low effort, Pi 1.2.0 harness, ordinary scoped read/search/edit/test tools, independent graders and two repetitions. There are 24 scheduled attempts. The tasks are reused (one historical, two synthetic), not fresh held-out evidence; their correctness ceiling remains a limitation.

## Arms and enforcement

| Arm | Availability | Required behavior |
|---|---|---|
| baseline | Ordinary tools | None |
| ast-assisted | Ordinary + existing Acorn navigation | Before the first edit, successful `symbols` discovery and `symbol_read` in the first edited production file |
| semantic-assisted | Ordinary + compiler graph/impact tools | Before every edit, current discovery, dependencies/callers inspection and impact analysis on the same relevant symbol/module, revision and edit epoch |
| semantic-optional | Identical semantic toolset | Natural choice; no required navigation |

The common base prompt is identical. Each arm has a frozen short workflow instruction; required workflows deliberately differ from optional availability. This compares workflows including the cost of mandatory analysis, not just algorithms under an identical prompt.

Edits are blocked until prerequisites finish successfully. Failed, stale, wrong-file and wrong-symbol calls cannot unlock a write. Symbol-level impact must enclose the exact replaced source span. Whole-file writes and edits across declarations/imports require module-level graph inspection/impact using the actual source path identity, after discovering declarations in that module. Any successful edit advances the epoch, requiring fresh semantic inspection before another edit. Concurrent mutations are serialized in every arm. AST enforcement is initial investigation only, matching the request; it is not an identical per-edit requirement.

Workers are instructed to print navigation results and use the evidence, including uncertainty. Successful calls/outputs, edit authorizations, blocked writes and epoch/revision evidence are retained. Tool invocation can establish workflow compliance; it cannot prove that a model reasoned well from the returned evidence. Required-arm failures remain in the denominator rather than being silently excluded. Independent patch acceptance, completion and activation compliance are reported separately.

No recipes are available in any arm. No hidden grader, reference patch or grading metadata is visible to workers. Existing permission-limited visible tests and scoped file tools remain the boundary.

## Controls and budget

Each task/arm uses a fresh snapshot/session. A rotating/reversed four-arm schedule is frozen before inference. All arms share 300 seconds, 100 tool calls, 26 model turns (expanded equally to accommodate mandatory investigation), 4,096 output tokens per request, no retries, no compaction, identical verification, and a $0.75 per-attempt conservative pre-dispatch allowance.

The shared v2 allowance is $7.50. With the first campaign's $0.3704032, maximum reserved campaign expenditure remains below the original combined $8 cap. Known API-equivalent usage releases unused reservation; unknown usage retains reservation and stops. Estimates are not subscription invoices. No model change or silent continuation is allowed.

## Reproduction and reporting

Run `node --test tests/semantic-activation.test.mjs` and the existing suites. Commit source before `node scripts/semantic-activated-experiment.mjs --freeze`, commit the frozen manifest, then run the script with `--run`. The existing prepared task snapshots are hash-checked against their independent validation receipts. The exclusive `.suffice/semantic-runs-v2` campaign directory cannot be overwritten. Results are published only under `reports/semantic-graph-v2`; v1 inputs/results remain unchanged.

`node scripts/semantic-activated-report.mjs` produces aggregates, every attempt and per-task comparisons, activation/use/error counts, inference/source retrieval and graph overhead. Compare semantic-assisted against both baseline and AST-assisted, and semantic-optional against its required counterpart. Full paths, categorical certainty and unresolved cases remain visible. Do not assume that forcing tools improves outcomes; retain failures, truncation, blocked-edit overhead and any budget-limited unrun attempts.
