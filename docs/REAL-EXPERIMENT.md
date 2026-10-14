# Real repository control experiments

Use npm/node-semver at commit efa4be6096c1f9b77d9d27d6132f6220c43b4e31. The compressed upstream source is about 71 KB; extracted nonhidden files total 251 KB. There are 132 nonhidden files and 48 production JavaScript files (2,464 lines). Original ISC license and repository layout remain in every workspace under src/.

Replay three historical fixes: prerelease subset bounds (#867 / issue #757), long build metadata in range parsing (#869), and dotted prerelease increments (#870 / issue #226). All use the same pre-fix source snapshot. Task prompts describe public behavior without revealing reference source. Hidden acceptance contains upstream examples and additional authored contract checks. Each baseline must fail and its upstream reference repair must pass. Seven upstream regression fixture groups are adapted to Node test without installing TAP dependencies, including original subset fixture cases extracted unchanged from the old TAP test. This is not the full upstream suite.

Frozen seven-arm comparison, GPT-6.1 Sol and GPT-6 Luna at low reasoning:

1. sol: baseline worker.
2. luna: cheap worker, same tools and task.
3. luna-review: Luna attempt (including a turn/tool/time budget exhaustion), fresh read-only Sol review, then one Sol repair only on a concrete repair verdict. Provider/authentication failures do not trigger escalation. A successfully reviewed/repaired result can complete even when its initial worker exhausted its budget; the worker status remains recorded. Invalid verdicts count as invalid treatments. Grading happens after all model phases. Costs include all phases.
4. luna-state: Luna plus explicit requirements/unresolved state and automatically recorded edits/test freshness.
5. luna-prune: Luna plus recoverable removal of old read-only outputs, above 18,000 serialized characters, retaining two recent assistant turns. Edits and test outputs stay visible.
6. luna-state-prune: both state and pruning, completing the 2x2 comparison against luna.
7. luna-repro: Luna with a mandatory immutable failing public-API reproducer before editing. It must pass afterward, alongside independent hidden and regression checks.

The reproduction tool accepts data, not arbitrary executable code. All arms have a public API assertion tool. Source edits are limited to existing production files; fixtures, tests, package metadata and docs cannot be changed. Worker test subprocesses retain the existing Node permission boundary with clean environments and bounded memory/time. This is not an OS sandbox. No network/shell tools or additional model weights are exposed.

Two repetitions, three tasks, rotated and reversed arm order: 42 runs. The separate infrastructure smoke exercised the subset task and exposed a workflow omission: budget exhaustion initially skipped review. That was corrected before freezing. State snapshots were also moved into structured tool results so codemode callers receive them. These smoke runs stay separate; this is not an untouched holdout evaluation. No harness edits during the frozen campaign. No hidden outcomes feed back into worker, reviewer, or repair prompts. Reference solutions are outside accessible workspaces. Public historical solutions may have been in model training.

Final regression adapter: 601 upstream fixture cases across seven groups (including 81 original subset cases, also checked with Range object inputs). A standalone review smoke successfully inspected the failed worker patch and returned a concrete repair finding. An earlier stdin-launched review smoke failed because Node's --input-type option leaked to the sandbox subprocess; that invocation failure is retained separately. Campaigns use standalone .mjs entrypoints.

Worker limit: 6 minutes, 24 generations and 100 tool events. Review: 3 minutes/12 generations. Repair: 4 minutes/16 generations. One retry per generation for transient provider errors. Stop after two consecutive runs with provider/harness failures, below 5 GiB disk headroom, or after $12 in known API-equivalent cost. Never use a paid API-key fallback. Existing Jev $2 ceiling remains unchanged; this campaign calls neither Jev nor OpenRouter. Subscription authorization failures stop work rather than trigger login.

Metrics: independent acceptance and regression, operational completion, total estimated cost per successful completion including failures/review/repair, known cost lower bounds for missing usage, latency, token/cache usage, false reviewer approvals, rescued failures, actual pruning activation, and reproduction fail-to-pass evidence. Keep all failed attempts. Never equate passing a generated test with correctness. No learned controller is trained.

Run with `node scripts/real-experiment.mjs --campaign=semver-control-v1 --repetitions=2`; summarize with `node scripts/real-report.mjs semver-control-v1`. Raw evidence stays ignored under .suffice/real-runs/. Aggregate reports are reviewable under reports/.
