# Fast mode for the Suffice harness — research

Goal: high-quality work in minimum wall-clock time. Cost is not a constraint.
The model's output TPS is the obvious bottleneck, but wall-clock per task is
`turns x (TTFT + output/TPS) + tool time + startup`. Every lever below attacks
one of those terms.

## Where time goes today

- `packages/cli/src/session.mjs` and `src/harness.mjs` both run the standard Pi
  loop: model turn -> tool calls -> tool results -> next model turn. Each turn
  is a serial provider round trip; N turns = N sequential calls.
- Codemode (`mode: 'only'`) already batches multiple tools into one turn — the
  biggest turn-count reducer is partially used.
- Pi 1.5.2 executes tool calls **in parallel by default** (`toolExecution:
  'parallel'`); Suffice doesn't override it, so intra-turn parallelism is free
  already.
- `cacheWarming: 'off'` in both session settings — turn 1 pays full TTFT.
- Retries: `maxRetries` 1-2 with 5 s base delay — a single 429/overload can add
  30 s to a run.
- Startup: resource-loader reload, extension binding, automation/browser spawn
  all precede the first prompt.

## Levers, ranked by expected wall-clock gain

### 1. Provider service tier — attacks TPS and TTFT directly

`@earendil-works/pi-ai` already forwards `serviceTier` into the OpenAI
Responses body (`params.service_tier`) and adjusts cost accounting
(`applyServiceTierPricing`), on both `openai-responses` and
`openai-codex-responses`. The coding-agent layer just never sets it — there is
no config surface (pi issue #5840), so the value must be injected through a
provider-options wrapper, the same trick `pi-openai-service-tier` /
`pi-openai-fast` use: wrap the provider call, pass
`{...options, serviceTier: 'priority'}`.

- `priority` exists for all OpenAI models (~2x cost, meaningfully higher
  throughput, lower queueing).
- `ultrafast` is exposed for `gpt-6.1-sol` and `gpt-6-astra` — the exact model
  Suffice defaults to.
- Caveat: badlogic measured no meaningful OpenAI speedup from serviceTier at
  one point (issue #4074); `ultrafast` pricing metadata is newer than that
  test. **Measure first — this is a one-config-change experiment.**

### 2. Race N trajectories, keep the first correct — the biggest structural win

Wall clock for N parallel attempts ~= `max(attempt_i) + verify`, not the sum
— and prefix caching makes attempts 2..N share most of their input tokens.
This converts "second try after a failure" (a serial 2x penalty today) into a
parallel race where the first correct patch wins.

The repo already owns every piece:

- `src/workflow-agent.mjs` `actor()` builds isolated `createAgentSession`
  workers — run several `.prompt()` calls concurrently, each in its own git
  worktree so edits never collide.
- `src/spec-gate.mjs` `selectAttempt()` picks the smallest-diff attempt that
  passed spec + visible tests.
- `scripts/consensus-select.mjs` picks a winner from N attempts by behavioral
  clustering — oracle-free.
- CodeMonkeys (arXiv:2501.14723) resolved 57.4% of SWE-bench Verified with
  10 parallel trajectories + test-vote selection — quality *improves* while
  time stays at one-attempt latency.

Fast-mode shape: dispatch N=3 identical sessions at once (identical prompt,
independent worktrees), take the first that passes verification, kill the
rest. Fallback when nothing passes: escalate to a single longer run rather
than serial N+1.

### 3. Fork-join decomposition — only when the task actually splits

Pi ships a subagent extension example (`examples/extensions/subagent`):
spawn isolated `pi` sessions per subtask, parallel mode up to 8 tasks /
4 concurrent, single/parallel/chain invocation. Suffice's `delegate` arm and
`createReadOnlyAssistant` are lighter precursors (bounded, tool-less).

Warning — measured evidence says naive concurrency makes agents *slower*:
arXiv:2610.10263 found dynamic concurrency raised mean runtime for 3 agents
(Claude Code 27.8 vs 17.5 min) while resolving fewer tasks. Speedups appeared
only when sub-agents got disjoint, complementary units and the parent
integrated. So: decompose into parallel workers **only** for tasks with clean
file-scope partitions (multi-file features, test+docs+impl); keep a solo path
otherwise. Never let workers edit the same file.

### 4. Fewer serial round trips per trajectory

- Front-load context: run `buildCodeGraph` / file index *before* the first
  model call and put a repo map in the prompt — removes 1-3 discovery turns.
  The graph builder already exists (`src/code-graph.mjs`); the `graph` arm
  proves it works mechanically.
- `terminate: true` on tool results that need no model follow-up (e.g. a
  pure side-effect write acknowledged by the tool) skips the trailing LLM
  call. Supported since Pi's `beforeToolCall`/`afterToolCall` result field.
- Raise codemode `inlineBudget` (2000 chars today) so larger batches don't
  spill into extra turns; prompt already pushes batching.
- Provider-side prompt cache: keep system prompt + tool defs as a byte-stable
  prefix, volatile content last (harness already logs `prefixRegressions` —
  reuse that telemetry to verify).

### 5. Per-turn cost and effort

- Adaptive effort per turn (low for reads, high for the final patch) was
  researched (`experiment/adaptive-effort`) — triggers never activated on the
  benchmark tasks. For a *speed* mode, forcing low effort on exploration turns
  and high on edit/verify turns is a real lever, but it trades quality —
  keep Sol at a fixed sensible effort unless measured otherwise.
- `retry.baseDelayMs` 5000 is slow for interactive use; tighten to ~1 s with
  jitter for fast mode.

### 6. Tool and startup latency

- Tests dominate tool time: scope test commands to affected files, run test
  files in parallel where the runner allows, keep `commandTimeout` bounds.
- Lazy-init automation/browser (spawn on first use, not at session create).
- Parallelize `loader.reload()` + extension binding with first-prompt prep.
- Keep a warm `ModelRuntime` + auth across sessions (already cached; ensure
  the desktop daemon doesn't re-create it per session).

## Proposed fast-mode profile (`session.mjs` option `speed: 'fast'`)

| Component | Change |
| --- | --- |
| Provider | Extension wraps OpenAI calls with `serviceTier: 'ultrafast'` for gpt-6.1-sol (fallback `priority`) |
| Trajectory | N=3 parallel sessions in git worktrees; first verified pass wins, losers reaped |
| Selection | `selectAttempt`-style gate: spec/visible tests -> smallest diff; consensus-select as tiebreak |
| Context | `buildCodeGraph` prefetch + repo map injected in turn 1 |
| Cache | `cacheWarming: 'on'`; byte-stable prompt prefix |
| Retry | `baseDelayMs` ~1 s |
| Tools | unchanged (parallel already default); `terminate` on no-follow-up results |
| Decomposition | optional fork-join only for tasks with disjoint file partitions |

## Measure first

Add per-phase latency events before building: for each turn log
`provider_wait_ms` (request -> first stream event) and `tool_ms` (call ->
result). That one instrumentation pass tells us whether TPS/TTFT (lever 1),
turn count (levers 2/4), or tool time (lever 6) dominates — and the
experiment harness already has the event log to hang it on.

## Open questions

1. Does `ultrafast` actually change Sol latency through the subscription
   path, or is it silently ignored (like the earlier `serviceTier` finding)?
2. Are parallel subscription sessions rate-limited per account? N=3 might
   serialize at the provider anyway — check before building the race.
3. Worktree isolation for the CLI product path (no `.suffice` workspace copy
   today) — need `git worktree add` scaffolding + cleanup.
4. Does codemode batching survive under `serviceTier`? Verify cost
   accounting still reports correctly with tier multipliers.

## Sources

- Pi repo: `packages/coding-agent/examples/extensions/subagent` (parallel
  subagents); `packages/agent/README.md` (parallel tool execution,
  `terminate` hint)
- pi issues #4074, #5840 (serviceTier wiring gap + extension workaround)
- arXiv:2610.10263 — dynamic concurrency often *increases* runtime; wins only
  on complementary decomposition
- arXiv:2501.14723 (CodeMonkeys) — best-of-N trajectories + test-vote
  selection
- OpenAI latency guide — cache-stable prefix, parallel calls, fewer round
  trips
