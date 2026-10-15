# Suffice versus native stock Pi: bounded paired pilot

**The unchanged Suffice baseline showed a cost advantage in this pilot, with tied acceptance. This does not establish that it is the better coding agent.** Excluding adapter validation, both agents accepted 3/3 tasks within the same budget. Suffice cost **$0.03155 per accepted task** versus **$0.04439** for native stock Pi, **28.9% lower**. The two previously actor-unused reserve tasks alone favored Suffice by 23.8%, driven by tinyqueue; Emittery was almost tied.

**Decision:** retain the existing Suffice baseline and this real Pi comparator; do not add an optimization mechanism or declare superiority. The fixtures are useful efficiency controls but did not discriminate correctness. Both reserve tasks are now exposed development data. A capability claim needs genuinely more discriminating, independently specified engineering work; this pilot does not provide it. No further campaign was started.

## Observed performance

Both arms used GPT-6.1 Sol low through the same subscription provider and model/pricing configuration. There were four pairs, one attempt per arm/task, serial and alternating order. The first pair validated the adapters and is excluded from the evaluation aggregate.

| Task | Exposure and scope | Suffice cost | Stock Pi cost | Both accepted within budget? |
| --- | --- | ---: | ---: | --- |
| fastq resume/worker accounting | Previously exposed; adapter validation only | $0.0341272 | $0.0408924 | Yes |
| Bottleneck weighted priority | Previously exposed; queue/datastore/scheduler integration | $0.0429220 | $0.0652668 | Yes |
| Emittery iterator lifecycle | Previously actor-unused reserve; complex stateful behavior | $0.0337408 | $0.0334836 | Yes |
| tinyqueue heap state | Previously actor-unused reserve; smaller efficiency control | $0.0179936 | $0.0344244 | Yes |

| Evaluation aggregate, excluding fastq | Suffice | Native stock Pi |
| --- | ---: | ---: |
| Accepted tasks | 3/3 | 3/3 |
| Budget-eligible successes | 3/3 | 3/3 |
| Total cost, including every attempt | $0.0946564 | $0.1331748 |
| Cost per accepted task / budget-eligible success | $0.0315521 | $0.0443916 |
| Fresh input tokens / cost | 35,939 / $0.0718780 | 42,655 / $0.0853100 |
| Cached input tokens / cost | 48,384 / $0.0048384 | 91,648 / $0.0091648 |
| Output tokens / cost | 1,794 / $0.0179400 | 3,870 / $0.0387000 |
| Model turns | 13 | 23 |
| Model-issued tool calls | 10 | 22 |
| All tool calls, including nested primitives | 42 | 22 |
| Sum of attempt latency | 57.766 s | 123.908 s |
| Operational failures / coding failures | 0 / 0 | 0 / 0 |
| Unknown full attempt costs | 0 | 0 |

Tool-call granularity differs: Suffice batches primitives through codemode; Pi issues native calls, sometimes parallel calls in one turn. Neither total is a normalized unit of useful work. Latency includes native CLI startup versus fresh SDK-session startup with a reused Suffice model runtime, and excludes fixture setup, engineering and grader replay. Network/cache warmth is not controlled. The observed latency difference is descriptive.

Reserve-only: 2/2 accepted for each agent; cost per accepted task was **$0.0258672** for Suffice and **$0.0339540** for Pi. Suffice was about 0.8% more expensive on Emittery and 47.7% cheaper on tinyqueue. One outcome drives most of the reserve aggregate; this is not replication across many difficult tasks.

Including adapter validation, both agents accepted 4/4. Their respective totals were $0.1287836 and $0.1740672. **All eight attempts together used $0.3028508 API-equivalent benchmark inference.** These are SDK cost estimates, not subscription billing or total project spending; parent engineering inference is excluded. No Jev or other auxiliary model was used. The human clarified that $2 was the Jev allowance and roughly $10 was available if needed. The pilot's separately chosen $2 known-cost admission target was left frozen and was not approached.

## This is the real Pi coding agent

Suffice called the byte-unchanged `src/benchmark-agent.mjs` from **a2745c6**. Its original nine core/navigation tools, codemode-only interface, short system prompt and settings were retained. A common file-backed OAuth lifecycle replaced the previously faulty in-memory authentication bridge; no behavior optimization was added.

The comparison arm spawned the installed, hash-pinned **Pi 1.2.0 bundled CLI**, not a direct-tool SDK reconstruction. Its actual requests declared the native **read, bash, edit, write** defaults. No `--tools`, prompt replacement, disabling of built-in extensions, codemode-only override or retry reduction was applied. Its native read/write/edit/Bash execution probes passed before inference. Startup resolved the same Sol ID, API and pricing as Suffice. Upstream documents the CLI and default native tools in [Pi's repository](https://github.com/earendil-works/pi); the installed docs and executable were the version-specific authority.

Stock Pi actually used its broader capabilities: it ran public checks and authored extra behavioral checks through Bash on every task. Suffice's existing interface could run only the supplied test tool and could not execute arbitrary scratch checks. This native advantage was preserved. Stock default compaction/cache/retry settings were retained; Suffice retained its existing disabled compaction/cache warming and one retry. No auxiliary inference appeared in this cohort. These are comparisons of whole configurations, not an ablation establishing which difference caused the cost gap.

## Controls, acceptance and accounting

Both agents received byte-identical public task text within each pair, the same pinned initial fixture, Node 24.15.0, Windows/PATH and an actor-only local Git baseline. Workspaces used opaque numeric labels. Actual native request user content and Suffice's saved user messages matched the frozen prompt hashes. Initial committed README, visible tests and changed production-file bytes were independently checked against the fixture.

The native Pi system prompt intentionally differs from Suffice's custom prompt. Full prompts and native wire declarations are saved. After replacing only the exact workspace directory, instructions and tool schemas had one stable variant within each agent. Cross-agent instruction equality was neither asserted nor manufactured. Unlike the earlier source-formatting pilot, no unexpected parity failure occurred.

The pre-existing, independently reviewed task contracts, requirement-to-assertion mappings, references and private acceptance checks were not modified. Before freezing, defective bases failed their intended private cases, visible regression samples passed, and references passed both suites. Each submitted production patch was graded in a clean reconstruction, rather than trusting actor-edited tests. All eight patches then passed another independent native replay. This establishes these acceptance outcomes, not full upstream regression coverage or maintainer approval.

All 48 provider requests matched finalized assistant receipts: 17 Suffice, 31 Pi. Pi's 31 raw completed-response usage records also reconciled input/cache/output counts with the SDK. Failed replies and retries would remain in durable events even if final history pruned them; missing/auxiliary usage would suppress complete totals. There were no such missing costs in this pilot. Fresh, cached and output cost components above sum to the reported totals.

Native stock tools retain ordinary host permissions; no new sandbox was introduced. Private graders/references were outside actor workspaces. Both agents received a workspace-only/no-network policy. All recorded file paths and shell programs were reviewed; no evaluator/reference access, dependency installation or network command was observed. This is an audited local policy boundary, not an OS-enforced isolation claim.

Limits were common: $0.20 per attempt after a response, 24 assistant replies, 120 calls and 240 seconds; eight attempts, $2 known-cost admission target, stop on one unknown full total, 128 MiB campaign artifacts and 1 GiB free disk. No stopping threshold was hit. These limits are not hard billing guarantees. Model-free adapter-development probe errors were preserved separately and were not scored as coding failures.

## What the trajectories tell us

Pi's extra verification was real work, not disabled functionality. On tinyqueue, two self-authored randomized test commands failed on invalid oracles. The first demanded object identity for equal priorities despite the public contract explicitly saying tie stability was not required; the second used strict equality between comparator -0 and 0. Pi corrected the tests and they passed, without another production edit. All those calls and costs remain included. They are not implementation failures, and the entire task cost gap cannot be causally assigned to them.

The workloads were not long-horizon: attempts took 13.2–52.3 seconds and peak input context ranged from 4,239 to 12,344 tokens. Bottleneck did require integration across actual production modules, and Emittery exercised nontrivial stateful lifecycle requirements; both remained short and all-pass. No duration/context/edit count was inflated. No persistence, compaction, delegation, routing, memory, compression or refinement treatment was tested.

These are disclosed injected defects in complete real repositories, not newly collected natural engineering issues. Public source may be present in model training. Fastq and Bottleneck were already exposed. The reserve allocation preceded repair attempts, but evaluators/authors had seen those fixtures. No fresh natural-issue held-out cohort, higher capability, reliability advantage, statistical superiority or external test-service result is established.

The smallest justified conclusion is therefore **an encouraging external cost result for the lean baseline, with no correctness separation and insufficient evidence of general superiority**. Keep the baseline unchanged, preserve this comparator, and stop spending on mechanisms inferred from these all-pass fixtures.

## Review records

`reports/external-pi/results.json` separates adapter validation, exposed evaluation and actor-unused reserve cohorts. `verification.json`, `adapter-gate-audit.json` and `receipt-audit.json` contain the checks; `access-review.json` preserves the reviewed calls. The review ZIP includes all eight raw attempt records, prompts, native invocations, complete finalized events, raw provider usage, final actor files, patches and grades; frozen source/manifest; task contracts, references, graders and provenance; and model-free preflight receipts. Credential stores, shared dependencies and engineering-agent conversations are excluded.

From this worktree, `node scripts/external-pi.mjs verify` replays without inference and `node scripts/audit-external-pi.mjs` reconciles receipts. `report` regenerates the raw aggregate. Do not rerun `freeze` or expand this completed campaign automatically.
