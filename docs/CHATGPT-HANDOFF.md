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
