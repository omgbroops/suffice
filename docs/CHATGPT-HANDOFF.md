# Suffice: project context, experiments, concerns, and next steps

Prepared October 14, 2026 for sharing with ChatGPT on the web. This is a self-contained account of the project through the decision to run the next experiment. The next experiment's results are not yet known at this document's creation.

## What we are building

Suffice is an experimental coding-agent harness built on Pi. The goal is lower **total cost per independently accepted coding task**, while preserving or improving correctness. We care about reliability, latency, context quality, and recovery costs, not just the cheapest model call or smallest context window.

The project lives at `C:\Users\Mohammed\Documents\GitHub\suffice`. It was initially being developed through a Codex session inside the Pantheon development app. The user asked the current assistant to inspect that session, understand its transcript, take over, and continue controlled experiments. At takeover, the inspected session was completed/idle, not still running.

The harness uses pinned Pi packages (`@earendil-works/pi-ai` and `pi-coding-agent` 1.2.0), Node.js, local workspace tools, and existing subscription-backed model access. No trained controller has been produced. Model routing, context selection, graph retrieval, and delegation remain experimental concepts rather than established product capabilities.

## User preferences and constraints

- Work autonomously while the user is at school; do not repeatedly stop for questions.
- Use a real open-source repository of reasonable size, not gigabytes of downloads or another invented toy app.
- Preserve existing work and experiment evidence. Do not silently replace failed attempts or retrofit scoring after seeing results.
- No new sandbox/container infrastructure for now. Local scripts and tools are fine.
- Keep costs bounded and distinguish usage-based estimates from actual subscription billing.
- The user wants candid explanations of disappointing results, not marketing claims.

## How the current harness works

The core has a short stable prompt and Pi's native **codemode**. The model writes JavaScript that invokes local tools, batches independent reads/searches, processes outputs, edits source, and runs tests. Dependent edits and tests must be sequenced. Core codemode has model calls disabled (`models: false`); batching ordinary tools does not spawn another LLM.

Tests execute in code. The LLM does not mentally simulate their results. The harness separately executes frozen hidden acceptance and regression checks. Source/test manifests, transcripts, patches, usage, and operational failures are saved. Credentials and raw private transcripts stay outside shareable reports.

Two distinct meanings of "compaction" have been explored:

1. Earlier **history pruning** removed older conversation/tool groups, sometimes losing working state.
2. Latest **compact tool responses** only reformatted printed observations. It preserved programmatic result objects and source lines, shortened successful test summaries, retained failure diagnostics, and made full originals recoverable. It did not prune conversation history or summarize away code.

## Experiment history

### 1. Synthetic core and helper-model experiments

The shorter-prompt + codemode core was compared with a controlled direct-tool Pi SDK baseline, using the same restricted tools and GPT-6.1 Sol at low effort.

- Pilot: 4 matched accepted pairs with complete telemetry; estimated cost 29.6% lower and model calls 36% lower.
- Holdout: 4 matched accepted pairs; estimated cost 34% lower and calls 38.5% lower.
- Both core and baseline passed the relevant eight tasks.

These are promising **bundle** results, not an isolated codemode effect. Tasks were tiny and AI-authored; cache warmth was uncontrolled; successful-pair analysis and sample size limit conclusions. The baseline was not an unrestricted stock coding CLI.

Helper models/watchers tried selecting supplemental source evidence. Results were mixed, and helpers often chose files the main model was already reading. A gated helper that made zero calls cannot establish helper quality. A free Gemma endpoint returned 429; fallback success does not validate that model treatment. No helper accuracy advantage was demonstrated.

Other early experiments:

- A basic graph used lexical imports and reverse dependencies, not a semantic call graph. It functioned, but tiny single-run tests established no causal benefit.
- A "delegate" selected exact source quotations read-only; it was not an autonomous implementing subagent.
- Fixed Luna-to-Sol routing promoted at the first codemode call, including read-only batches. It did not test sustained cheap exploration followed by selective promotion.
- Aggressive pruning caused rereading, repeated edits, lost completion state, and timeouts. Some resulting patches were correct but the agent failed to finish.
- Conservative revised retention passed but pruned zero requests, so it provided no evidence of active context-selection benefit.

Primary artifacts: `reports/RESULTS.md`, `reports/CONTEXT-RESULTS.md`, `reports/context-screen-review.md`.

### 2. First real-repository campaign: semver-control-v1

Repository: npm/node-semver, pinned source revision. About 71 KB compressed, 251 KB extracted nonhidden files, 132 files, 48 production JS files, 2,464 production lines. This is real open-source code, but still a small library.

Three historical bugs: prerelease subset handling, long build metadata, dotted prerelease increments. Seven configurations, two repetitions: **42 attempts**. All model phases used low effort.

| Configuration | Passed frozen acceptance | Mean estimated cost | Mean time |
|---|---:|---:|---:|
| GPT-6.1 Sol core | 6/6 | $0.05495 | 62.3 s |
| GPT-6 Luna core | 2/6 | $0.00467, 5 known | 54.2 s |
| Luna worker + fresh Sol review/repair | 6/6 | $0.09376 | 138.8 s |
| Luna + explicit progress state | 2/6 | $0.00490 | 61.2 s |
| Luna + pruning | 2/6 | $0.00550, 3 known | 68.4 s |
| Luna + state + pruning | 3/6 | $0.00679 | 54.1 s |
| Luna + reproduction-first | 2/6 | $0.00430, 5 known | 49.5 s |

The combined cheap-worker/strong-reviewer system matched Sol's passes but was **70.6% more expensive and 2.23 times slower**. Every reviewer requested repair. Three worker patches already passed frozen tests, but review identified additional issues. Sol alone already solved all six attempts.

This tested **cheap model attempts the entire problem first, strong model reviews afterward**. It did NOT test **strong model plans first, cheap model implements a bounded change**.

Pruning really activated in this campaign. Three pruning-only runs exhausted their turn budgets. State + pruning's one extra success was not robust evidence on six attempts.

Reproduction-first used declarative semver API assertions. All six established a failing reproducer before edits. Three made their reproducer pass, but only two passed independent acceptance. Fixing a generated example is not equivalent to fixing the full issue.

Post-hoc diagnostics found malformed metadata and consecutive mutable API-call regressions beyond frozen tests. One historical upstream reference fix also failed the consecutive-call diagnostic. These findings were kept separate; primary scores were not retroactively rewritten.

Five attempts had unknown total cost because of limits/provider failures; known usage was retained as a lower bound. No Jev/OpenRouter calls were made. Only Sol and Luna were used. 68 harness tests passed at this stage.

Primary artifacts: `reports/SEMVER-RESULTS.md`, `reports/semver-control-v1.json`, `docs/REAL-EXPERIMENT.md`.

### 3. Latest completed campaign: sol-tools-v1

The user requested compact responses alone, navigation alone, and both together. We included a control. Four fresh historical node-semver bugs, four configurations, three repetitions: **48 attempts**. Every generation was **GPT-6.1 Sol, low reasoning effort**.

Tasks: numeric wildcard-range ordering; exact caret prerelease lower bounds; prerelease-to-stable diff classification; digit-prefixed alphanumeric prerelease parsing/coercion.

All 48 passed frozen acceptance and regression checks. Two recovered 503 failures left incomplete cost telemetry. The fair four-way cost comparison uses the same **11 task/repetition groups** with complete costs in all configurations; all attempts remain in correctness counts.

| Configuration | Passed | Mean estimated cost, common 11 | Relative cost |
|---|---:|---:|---:|
| Sol/core control | 12/12 | $0.0441805 | baseline |
| Compact printed observations | 12/12 | $0.0354136 | 19.8% lower |
| AST navigation | 12/12 | $0.0332175 | 24.8% lower |
| Both | 12/12 | $0.0356067 | 19.4% lower |

Navigation alone averaged 11,534 uncached input tokens, versus 12,556 combined and 17,405 control. Savings were not simply fewer model calls: navigation used slightly more generations than control.

Compact-only formatted 41 responses, reducing printed characters locally by 15.4%. Combined formatted 44, reducing them by 17.8%. Navigation was invoked 42 times alone and 43 combined. No full-output recovery calls occurred.

Why wasn't combined best? We do NOT have a proven causal explanation. Presentation can change subsequent investigation choices; retrieval and compression overlap; model variability and cache warmth also matter. Combined produced more uncached input overall despite shorter individual outputs. The formatter did not discard source code, so information loss is not an established explanation. Combined was best on some tasks, while a larger range-parser task strongly favored navigation alone.

Compact-only was about 6% and 8% more expensive on two small task types. Benefits were not uniform. Four historical bugs from one library, possibly represented in training, are insufficient for a general claim. All-pass results show no observed accuracy loss, not guaranteed correctness or an accuracy gain.

Verification: 77 harness tests passed; all 48 patches passed supplemental upstream diff/coerce test bodies (245-264 assertions/workspace); input and patch integrity verified. A documented storage-only continuation amendment lowered the free-space floor to 1 GiB and capped campaign artifacts at 100 MiB. No model/task/prompt/test change was made. No user files were deleted. All runs finished.

Primary artifacts: `reports/TOOL-EFFICIENCY-RESULTS.md`, `reports/sol-tools-verification.json`, `docs/TOOL-EFFICIENCY.md`.

## How navigation actually works

Acorn parses JS into syntax trees. A local index offers:

- `symbols`: find functions, classes, methods, bindings by name and return paths/line ranges.
- `symbol_read`: retrieve the exact definition plus imports, with explicit pagination.
- `symbol_references`: return syntactic identifier-name references in production/tests.

Indexes refresh after edits. Ordinary read/search tools remain available. References are candidates, not fully resolved bindings/calls. This is not a graph database, embedding system, whole-program semantic call graph, or LLM-generated summary. No extra inference is required. Implementation: `src/symbol-navigation.mjs`.

## User's proposed architecture and concerns

The user proposed a frontier orchestrator defining the work/tests, delegating implementation to substantially cheaper models, and having **code execute tests and return actual results**. They also proposed cheaper read-only scouts inspecting code and sending findings to reduce parent context bloat.

Their concerns are central to the experiment:

1. Workers may be context-blind and miss cross-component constraints.
2. Summaries can lose important detail, qualification, or intermediate discoveries.
3. Delegation can drift from the original objective.
4. The parent may spend more tokens explaining a job than it saves.
5. The parent may then reread everything to verify it, duplicating cost.
6. Workers may lose useful intermediate working state between handoffs.
7. A small context is not automatically sufficient context.
8. Combining individually helpful mechanisms may change trajectories and cost more.

The refined proposal is to start with ONE bounded implementation worker, not a swarm:

Strong model identifies requirements, design boundaries, invariants and acceptance criteria -> deterministic code assembles relevant source/context -> cheap model implements -> code executes tests/patch checks -> strong model reviews concise evidence and accepts, requests a bounded repair, or takes over.

Context packets should have revision identifiers, exact source references, requirements, constraints and unresolved questions. Scouts should answer narrow semantic questions (e.g. which callers rely on mutation), return cited evidence and uncertainty, and preserve access to raw source. Summaries are an index to evidence, not a replacement for it.

Preserve useful working state: decisions, reasons for rejected approaches, assumptions, unfinished work, changed files and test outcomes. Passing whole exploratory transcripts between agents would recreate bloat. There is no oracle guaranteeing the exact sufficient context upfront; use bounded initial retrieval with demand-driven expansion and stale-source detection.

Delegation is economical only if work shifted off the expensive model exceeds planning, briefing, worker, review, retries, and duplicated-reading costs. Code should generate repetitive packets and execute checks. Models should handle decisions that require judgment. Keep independent acceptance tests beyond model-generated tests.

## External precedents discussed

- Aider architect/editor separates solution reasoning from edit generation. Its historical benchmark showed improved success for some model pairs; this is precedent, not proof for our models or a universal cost win: https://aider.chat/2024/09/26/architect.html
- Agentless separates localization, repair and patch validation, with generated reproduction tests and regression checks: https://github.com/OpenAutoCoder/Agentless
- Anthropic's multi-agent research system demonstrated benefits for parallel research while describing substantial token overhead and limits for tightly coupled coding tasks: https://www.anthropic.com/engineering/multi-agent-research-system
- Reason describes codemode batching/filtering, minimal tools, and stable append-only cache-eligible requests. It also supports deferred subagent tools; the claim that it categorically replaces all subagents with scripts is too strong. Its authors had not isolated each principle's contribution: https://reasonmachines.com/blog/introducing-reason-agent-1-1

The user supplied https://dev.to/octomind_dev/why-one-ai-agent-isnt-enough-subagent-delegation-and-context-drift-195o and https://www.skillsdirectory.com/skills/reason-machines-claude-code-prompts . These are discussion/prompt-template sources, not sufficient primary evidence for Reason's exact architecture. We checked Reason's own publication.

Suffice already implements the central codemode idea. Further deterministic workflow improvements can be tested without new sandbox infrastructure.

## Authorized next experiment

The user approved this comparison, after first writing this handoff:

| Arm | Purpose |
|---|---|
| A: Sol + navigation | Carry forward the leading observed baseline |
| B: Sol + navigation + deterministic context/test workflow | Isolate workflow changes without changing implementation model |
| C: Same workflow, Sol plans and one Luna worker implements | Isolate cheaper implementation beyond the workflow changes |

Use fresh issues in another modest-sized real repository, preferably harder/more coupled than semver. Freeze prompts, tasks, acceptance, regression checks, phase budgets and scoring before the main campaign. Count planning/review/repair and failed-attempt usage. Rotate configuration order, repeat tasks, preserve unknown telemetry instead of guessing, and track latency and correctness alongside cost.

B and C should share the same phase structure so that changing the worker model is the key difference. Preserve a stable parent session if feasible, and attach concise programmatically generated results. Cap cheap repair attempts before escalation; do not allow unbounded parent/worker negotiation. No hidden-test feedback should enter repair loops.

A read-only semantic scout is a later separate experiment. Do not bundle scouting, a new graph, compaction, different effort settings and worker routing into one treatment and then attribute any result to one feature.

## Other potential next steps

- Replicate navigation savings on larger source files and another repository.
- Assemble dependency-aware source packets using deterministic structure, then expand only when needed.
- Measure the cost of the parent separately from workers to detect briefing/review overhead.
- Improve preservation-of-behavior testing, including stateful API sequences and malformed inputs.
- Test scout evidence packets only when there is genuinely uncertain semantic discovery that ordinary tools cannot cheaply resolve.
- Test cache-preserving workflow changes separately from deleting history.
- Eventually learn routing decisions only after collecting substantially more representative examples. The current few bugs are not enough to train or validate a general controller.

## What is not established

We have not proved general superiority over stock Codex/Pi, trained a decision model, shown a general accuracy improvement, or shown that cheap multi-agent implementation saves money. We have observed promising tool-level efficiency gains on limited cohorts. The next experiment is intended to test a materially different delegation strategy, not to assume its success.

This document contains no credentials or raw private transcript. A future results addendum should identify the new campaign and its limitations without changing the historical account above.

## Results addendum — October 14, 2026

The authorized A/B/C experiment is now complete, alongside five parallel investigations requested later by the user. The execution moved from the heavy Codex desktop app to Pantheon Dev through a native full-history fork. The coordinating parent was configured as Codex / GPT-6 Astra HIGH; all five engineering subagents were explicitly GPT-6.1 Sol. These settings did not change the separately frozen benchmark models: Sol low, Luna low for the cheap implementation worker, and Sol medium only where required by the adaptive-effort experiment.

The user requested existing separate Git worktrees, independent experiment directories, frozen harness versions, and no changes to the running A/B/C implementation. They also explicitly allowed concurrent live jobs. Those constraints were preserved. Their weekly subscription limit interrupted several pilots; after the user reset it, the unchanged main campaign resumed through `--resume`, while child experiments with amended orchestration used separately named frozen post-reset campaigns. Failed receipts and unknown usage were retained rather than replaced.

The user's added research goal is important: **efficiency means the same correctness at lower total cost; capability means solving more difficult tasks at the same total cost.** An all-pass benchmark cannot establish a capability improvement. They also proposed eventually learning which tool calls, context, reasoning and verification are worth their cost. No decision model has been trained; representative traces and real failures must come first.

| Investigation | Final finding |
|---|---|
| Architect A/B/C, 27 attempts | All patches independently accepted; 26 executions successful, one preserved quota failure. Eight complete-cost groups: solo $0.053521, Sol worker $0.128689, Luna worker $0.081468. Delegation cost +140.4% / +52.2% versus solo. |
| Adaptive effort, 9 attempts including interrupted pilots | A harder LRU-cache lifecycle task failed at low (0/2), medium (0/1), and adaptive (0/1). All passed visible checks and missed the same hidden invariant. No adaptive switch occurred. |
| Retrieval, 40 offline packets | Five issues, lexical/AST/import/hybrid, estimated 4K/8K ceilings. No method dominated; retrieving the right file sometimes missed every repair-hunk line. No coding-model calls or capability measurement. |
| Intelligent tests, 18 scored + 4 screening attempts | Every scored arm passed 6/6. Fixed checkpoints cost 16.5% less and deferred twelve requests; selective deferred none, so its lower observed cost cannot be attributed to the policy. Fixed checkpoints can suppress novel failure feedback. |
| Recoverable retention, 8 scored + 3 screening/interrupted attempts | All scored patches passed. Dynamic historical-body replacement activated in every treatment attempt but cost 43.8% more, with fewer cache-read and more uncached input tokens. |
| Recovery, 6 post-reset + 4 provider-limited attempts | Normal and rollback arms each passed 1/3; zero actual rollbacks. The harder task failed in both arms despite passing visible checks. |

The cheap worker itself was inexpensive: Sol planning/review represented **96.6% of the Luna workflow's cost** in common groups. One Luna patch needed parent repair. A Sol workflow exposed an invalid parent-generated test input; the frozen check remained failed while independent acceptance passed. Generated tests are useful evidence, not a replacement for independent correctness criteria. This campaign's workflow allowance exceeds solo's, and the tasks all passed solo, so it does not test matched-budget capability.

Retention's exact design matters. It preserved assistant/user messages, call/result pairing, work state and access to archived source, but embedded changing current state inside old result replacements. That can repeatedly invalidate an early cache prefix. Static references plus append-only state are an untested alternative. This result is distinct from compacting printed tool responses before their first insertion into history, which had earlier positive results.

The test scheduler had a concurrent admission race discovered during parent review. Saved live traces showed no detected overlaps or gate violations, with timing-resolution limitations. A separate serialized v2 fix passed eight concurrency tests after the campaign; it remains unbenchmarked and is not part of the scored runtime. Independent post-campaign acceptance/regression/upstream reruns passed all 18 scored patches.

The recovery engineering subagent was stopped by an automatic content-safety check. Its already-running frozen pilot completed normally, and a read-only parent audit verified the saved evidence. The blocked action was not retried; prepared LRU and larger recovery follow-ups were not launched. This is a scope limitation separate from model coding failures.

The most useful new finding is **failure despite passing visible checks**. The adaptive and recovery triggers watched observed failures/stalls and did not recognize these incomplete solutions. More effort or rollback cannot be credited when the policy never activates. Medium effort also failed the hard LRU case. There is still no proven capability-frontier gain, and no measured superiority over stock Codex or Claude Code.

Recommended next work: first test behavior-focused verification on new stateful tasks under a total cost budget, using explicit requirement-to-executable-check coverage and independent hidden acceptance. Separately test retrieval inside large definitions and stable cache references on long trajectories. Keep low-effort navigation and append-only history as the baseline. Do not train a router from this small sample or tune on these hidden failures and call them held-out tasks. A larger implementation workload may amortize delegation overhead, but that needs a fresh controlled experiment.

Across this new round: **79 live attempts, 40 offline packets, $5.22199664 known API-equivalent inference**, with **nine unknown attempt totals**. This is a lower bound, not subscription billing or total project cost; engineering-agent inference and older campaigns are excluded. Source/test/model/cost integrity checks passed, failed attempts remain preserved, and experiment implementations remain isolated in their worktrees. All scheduled A/B/C and bounded child work has stopped; the recovery scope exception is explained above.

Canonical evidence: [consolidated findings and all branch-report links](../reports/PARALLEL-EXPERIMENTS-RESULTS.md), [architect results](../reports/WORKFLOW-RESULTS.md), [architect verification](../reports/yaml-workflow-v1-verification.json), and [current status](../STATUS.md). The earlier sections of this document intentionally preserve what was known before these results.

## Follow-up: Nemotron retrieval and revision-aware evidence

The user emphasized reducing cost and improving accuracy simultaneously, asked whether a conventional chat/tool harness was the right architecture, and authorized two GPT-6.1 Sol engineering subagents. One investigated free Nemotron embeddings; the other investigated a small evidence record and targeted verification under the same total inference allowance. A proposed local `decomp` transcript analysis was deferred because its scripts were not installed; no transcript scan or upload occurred.

Both new experiments' live measurements are complete, with no new default enabled. Independent branches are `experiment/nemotron-retrieval` and `experiment/evidence-record`. Their repair actors use GPT-6.1 Sol low; Nemotron is a retrieval component, not a repair worker or a correctness judge.

| Scored comparison | Accepted patches | Mean benchmark inference | Change from corresponding baseline |
|---|---:|---:|---:|
| Navigation baseline, retrieval study | 4/4 | $0.0249958 | baseline |
| Navigation + fixed-query semantic tool | 4/4 | $0.0265604 | +6.3% |
| Navigation + normal checks, evidence study | 5/5 | $0.0275172 | baseline |
| Same + revision-aware record | 5/5 | $0.0509652 | +85.2% |
| Same record + requirement-directed checks | 5/5 | $0.05653968 | +105.5% |

Nemotron's offline ranking improved mean repair-region proxy coverage at a 2048 estimated-unit ceiling from lexical 43.9% to semantic 73.8%. The corpus comprised six public tasks from three repositories, 60 scored packets, identical chunks and packing rules. The ranker did not dominate every task; TypeScript parser failures weakened syntax comparisons, and five queries were investigator-authored public-PR paraphrases. All live tasks had been offline-screened. The live semantic tool actually activated but only used fixed initial issue queries and immutable vectors; no dynamic query generation or incremental re-embedding was tested. Better offline localization did not translate into lower observed repair cost.

The evidence study used 22 live attempts: four initial activation-pilot attempts, three harder p-map screening attempts, and fifteen scored attempts across quick-lru, p-map and eventemitter3. The scored generic behavioral-test executor was equally available to all arms. All 22 patches passed frozen acceptance; 20 were eligible within the $0.12 per-attempt allowance. Two harder-screen treatments exceeded it, with one unknown full cost after a recovered provider error. No baseline patch failed, so there was no capability rescue to demonstrate.

The record and directed checks activated. However, the scored baseline had zero exact repeated source reads for the record to eliminate. B/C made five/seven explicit record reads and five/nine generated checks, versus five checks in A. Record flags were diagnostics, not a hard completion gate; most treatment actors retained generic hidden-acceptance caveats and still finished. The record starts empty each attempt and invalidates full source snapshots conservatively. This does not evaluate warm cross-task reuse or restart recovery.

Generated-test validity remains a real issue: one scored callback expectation and a screening exact-concurrency expectation were invalid. Other tests disagreed with an upstream reference because they exercised expanded requirements or unsupported assumptions. Agreement with a reference is not proof, and disagreement alone does not establish a faulty test. The final report distinguishes these cases and retains original frozen scores; any later grader-sensitivity checks are separately labeled post-hoc.

Across these two investigations there were **34 live attempts, 60 offline packets and 33 embedding HTTP admissions**. Known benchmark inference was **$1.4302372**, excluding engineering inference and all earlier campaigns. All 32 completed embedding responses reported zero charge; one interrupted request has unknown usage/cost. One repair total is also unknown. A stopped default-mode index, the corrected passage/query freeze, a serving-model alias and an unenforced output-token configuration are documented rather than hidden.

Code-run audits reproduced saved results. A local-only probe also established that Node filesystem permissions do not isolate networking. Static inspection found no network/solution-retrieval patterns in 126 saved evidence-actor programs and 33 generated tests; that is not packet tracing or an obfuscation-proof guarantee. No new sandbox infrastructure was introduced. The portable review bundle includes both new branches' public reconstruction evidence and the detailed older branch reports that the previous ZIP omitted; it excludes credentials and engineering transcripts. See [follow-up findings](../reports/EVIDENCE-EXPERIMENTS-RESULTS.md) and [status](../STATUS.md) for final audit/export state.

Interpretation: these tested additions spent more without improving graded acceptance. This does not establish that the project is becoming less accurate, or that every evidence/retrieval architecture fails. Future evaluation needs tasks exhibiting actual baseline rediscovery or requirement-coverage failures, and eventual comparison against external agents. Keep the simple navigation baseline and do not train a controller from these few mostly successful trajectories.


## Tool-interface friction follow-up

Three explicitly requested Sol research subagents worked separately in ../suffice-experiments/research-printing, research-capability and research-prime. Reports copied under root reports/friction-research. Exact failures narrowed to LRU status.oldValue and finalizer reason-prefix specificity; original acceptance scores preserved. Printing analysis found 27,270-character lossless-formatting arithmetic opportunity (3.53% visible text), with no model cost/correctness claim. All 25 earlier directory failures were followed by successful narrower/omitted-path calls or other work; partial output was retained, subsequent spending is not avoidable cost.

New parent campaign in ../suffice-experiments/interface-friction changes only descriptions/path argument descriptions/actionable EISDIR errors for symbols, search and symbol_references. Existing file-only behavior unchanged in both arms. Two separate synthetic pilots and twelve scored attempts on newly selected historical JSON5 #210, dotenv #814, flatted #40 snapshots finished. Six matched groups: both 6/6 within-budget accepted; directory errors A=1/B=0, turns 29/29; mean known costs A=$0.02544267, B=$0.027949 (+9.85%). Cost signs reverse on repeated JSON5/flatted tasks. B error-message branch never activated live; description hashes differ and common system instructions match. $0.3402348 known API-equivalent campaign inference includes pilot; engineering/research inference excluded. No feature/default adoption or compression campaign. Frozen pilot/scored manifests and all receipts remain in the worktree .suffice/friction-runs. Parent independently reconstructed all fourteen patches and reconciled usage and frozen inputs; exact scores do not certify full upstream suites. These are scoped authored regressions, small modules, public historical fixes and uncontrolled provider-cache warmth; no capability improvement established.


## Benchmark v1 qualification and workload-length finding

October 14: isolated ../suffice-experiments/benchmark-v1 contains six independently reviewed complete pinned real-source candidates, explicit public requirement/grader mappings, frozen references, separate efficiency/capability rules, ex-ante scope tiers, unused repair-actor reserves and competitor readiness gates. This is candidate qualification, not a validated benchmark release or external head-to-head. Four repair pilots and one separate authored Tapable feature pilot produced five accepted patches. All five saved patches replayed successfully both locally and from the verified review ZIP. The original six-attempt repair schedule stopped at four under its preregistered unknown-cost admission rule. Total known API-equivalent benchmark inference is $0.1546224 with TWO unknown full attempt totals; engineering inference is excluded and full total spend is unknown. Do not report five known-budget successes: only three qualify.

The four repairs took 4-6 assistant events and 21-32 seconds. The staged Tapable feature passed all seven public and sixteen hidden checks in 51.94 seconds, six events including two server overloads, and 9,097 peak input-context tokens. A valid three-file implementation simplified the four-module reference. This does not expose long-horizon work, compaction, persistence or delegation; no such optimization was tested or promoted. Task-level preparation notes are frozen preregistration history; docs/benchmark-v1/RESULTS.md and per-phase results are current outcomes.

Durable event accounting matters: Pi removed one failed reply from final history after retry, so the frozen transcript-only checker flagged unknown-cost reconciliation; original receipts remain. The supplemental event audit reconciles all attempts without imputing free failures. Independent patch/contract reviews and source hashes passed, with campaign incompleteness preserved. Two reserve tasks (Emittery and tinyqueue) remain unused by repair actors. Native stock Pi/Prime/Codex adapters are not yet scored-ready; no competitor superiority claim. Next priority is coherent larger real engineering issues that demonstrably require sustained investigation/integration, followed by mechanism-specific activation checks and matched-budget comparisons. No learned task router.

Entry points: reports/BENCHMARK-V1-STATUS.json, BENCHMARK-V1-BUNDLE.json and BENCHMARK-V1-EXPORT-VALIDATION.json. Detailed sources, original reviews and benchmark actor traces are included in the ZIP, not merely linked to local worktrees. Root defaults, older frozen campaigns, shared credentials/dependencies and dirty user work were preserved.


## Source presentation A/B: authentication blocked before inference

After the benchmark-preparation critique, a concrete lossless presentation intervention was selected from saved traces, in ../suffice-experiments/source-presentation. Offline exact source/metadata roundtrip: 120 eligible objects across39 exposed transcripts; visible characters880463 to854692 (-2.93%), not a token/cost result. Five tests including the installed Responses serializer pass. No new tasks, models, summaries or prompts were added. The frozen intended pilot is12 paired/counterbalanced Sol-low attempts on three exposed efficiency-control tasks.

The first A/B startup reached zero model requests/tool calls/treatment activations: stored Pi OpenAI OAuth refresh failed invalid_grant. Those two records are authentication failures, not code-capability failures and not an optimization result. Their raw unknown-cost placeholders are preserved. A separate frozen v2 corrects the shared authentication lifecycle: canonical SDK file-backed storage persists refreshes, with auth resolution before allocating scored attempts. The earlier in-memory bridge could lose a rotated refresh token; the precise cause of this invalid_grant is not proven. Existing frozen benchmark inputs remain unchanged.

Live inference awaits human browser sign-in using node scripts/login.mjs from the root Suffice checkout. A text request was sent; no reply/renewal has yet been observed. Resume command after sign-in: node scripts/source-presentation-v2.mjs run --resume in ../suffice-experiments/source-presentation. Read reports/SOURCE-PRESENTATION-STATUS.json. Do not report the formatter as a harness improvement until the live A/B produces evidence.


## Source presentation v2: live pilot completed

Renewed human login was verified; the frozen twelve-attempt Sol-low A/B completed. Original JSON A: 6/6 accepted, mean/cost per accepted $0.0347411. Lossless source framing B: 6/6 accepted, $0.0365555 (+5.2% observed). Total API-equivalent benchmark inference $0.4277792 with zero unknown attempt totals; engineering inference and subscription billing are excluded. Treatment activated in eleven outputs/twenty-two source objects, reached the actual wire, and avoided 2,422 characters without losing source or metadata. Twenty-seven assistant turns per arm. No efficiency/capability improvement or default promotion.

All twelve patch replays and receipt rows passed. The frozen global verification FAILED strict system-instruction byte parity: twelve unique SDK cwd fields. A separate post-hoc audit reconstructed all 54 actual request instruction hashes and found no differences beyond the exact workspace field; this does not override the failed frozen gate. Tool schemas and per-task initial user text matched. Retain descriptive results and this limitation; do not call every validation passed. Three previously exposed injected-defect tasks, six correlated pairs, no new upstream fix or competitor result. Prior v1 OAuth startup failures remain separate.

Detailed report: C:/Users/Mohammed/Documents/GitHub/suffice-experiments/source-presentation/docs/source-presentation-v2/RESULTS.md. Data/audits: ../suffice-experiments/source-presentation/reports/source-presentation-v2/. Root pointer: reports/SOURCE-PRESENTATION-STATUS.json. The former login-blocked note is superseded; no further sign-in or live attempts are pending. Existing harness defaults and older frozen campaigns remain unchanged.


## External stock Pi comparison: bounded pilot completed

The reset research priority was executed without a new optimization mechanism. Native Pi 1.2.0 bundled CLI with its stock prompt/read/bash/edit/write tools was compared with unchanged Suffice benchmark-agent.mjs from a2745c6, both GPT-6.1 Sol low. Freeze d29f1e2; eight attempts completed. Initial exposed fastq pair validated adapters and is excluded from evaluation. Evaluation: 3/3 accepted and budget-eligible in each arm; cost per accepted task Suffice $0.0315521 versus Pi $0.0443916 (-28.9%). Separate previously actor-unused reserve subset: 2/2 each, $0.0258672 versus $0.0339540 (-23.8%), driven by tinyqueue; Emittery nearly tied. All eight including validation accepted; total benchmark API-equivalent inference $0.3028508, no unknown full costs, no operational failures, no Jev. Engineering inference and subscription billing are excluded. The human clarified $2 was for Jev and roughly $10 was available if needed; the pilot's self-chosen $2 admission target was retained and was not approached.

All eight reconstructed patch replays, raw event/provider usage reconciliation, actual common user-message parity and within-arm prompt/schema checks passed. Native system/tool differences were preserved, not normalized away. Stock used real Bash-generated behavioral checks; two invalid tinyqueue test oracles were corrected without production edits and all costs retained. Native host access is not OS-contained; all calls were reviewed with no observed evaluator/reference or outside-workspace access.

Decision: retain baseline/comparator, no superiority/reliability/capability claim; all-pass short injected tasks do not discriminate correctness or establish representative long engineering performance. No further campaign started. Both reserve fixtures are now exposed; older benchmark-v1 notes saying they were unused are historical and superseded. Detailed report: C:/Users/Mohammed/Documents/GitHub/suffice-experiments/external-pi/docs/external-pi/RESULTS.md. Root pointer reports/EXTERNAL-PI-STATUS.json; raw records ../suffice-experiments/external-pi/.suffice/external-pi-v1/. Existing root product code, defaults, older frozen campaigns and dirty work preserved.

Review bundle: C:/Users/Mohammed/Documents/GitHub/suffice-experiments/external-pi/.suffice/review-bundles/external-pi-v1-20261015-042139.zip (14531092 bytes, 2203 entries, SHA-256 bc91c95d988470b390b3d39f73992330eb96fb7197f9d408a7c6887ddbdeb3f9). Every ZIP entry hash/CRC checked; complete current attempt receipts and prior contract review records included, credentials excluded. Pointer: reports/EXTERNAL-PI-BUNDLE.json.
