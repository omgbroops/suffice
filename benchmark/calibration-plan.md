# V1 controls and V2 assistance calibration

Freeze 32 attempts before inference: four fresh public Terminal-Bench 2 tasks,
eight arms, one attempt per pair. Tasks: log-summary-date-ranges, kv-store-grpc,
filter-js-from-html, db-wal-recovery. These were excluded from both the original
30-task campaign and the five-task pilot, selected for bounded public checks,
installed Python prerequisites, varied behavior and 2 GiB containers. Selection
is purposive, not representative. There are no JavaScript/TypeScript source
tasks to establish Suffice's AST-navigation advantage.

Arms, fixed in calibration-arms.mjs:

- pi: stock Pi 1.2.0, Sol High, unchanged tools/system prompt.
- v1-original: Flexible with enhancements off, source frozen at 526eee4;
  its original repository prompt, tools, codemode and cache behavior are retained.
- v1-refined: Sol High, explicit isolated-task scope, one public-failure repair.
- v1-concise: v1-refined plus concise communication instructions only.
- v2-alone: Luna High, existing efficient core, one same-model repair, no Sol.
- v2-upfront: same efficient core with one Sol Low upfront plan and conditional
  Sol Low takeover after a failed Luna repair.
- v2-selective: same as upfront, but Sol advice is failure-triggered.
- v2-concise: v2-selective plus concise communication instructions only.

All receive the identical original task plus visible partial self-check command.
Baseline V1 performs observation but no controller repair; Pi also receives no
extra post-completion model turn. Required product installations are actual
candidate assertions, not optional checker prerequisites. Every arm uses the
task's existing system Python for both its public command and controller check.
No portable candidate interpreter or per-actor PATH workaround is supplied.

The no-Sol and assisted arms compare assistance policies; they do not isolate
advice from takeover. Upfront versus selective holds takeover fixed. Concise
versus its direct control changes only communication instructions, not model,
effort, tools, budgets or check coverage. Output tokens include reasoning/tool
arguments; separately report visible-text volume and available reasoning usage.
No forced output-token cap, reasoning-effort reduction or hidden reasoning prompt.

Use original task timeouts and a shared $5/100-response/240-tool whole-attempt
allowance for all stages. No new per-stage sublimit. Up to four 1-CPU/2-GiB task
containers may overlap on Sonion's 16 logical CPUs. Admit only while Linux
MemAvailable exceeds 1536 MiB; when low, wait for active attempts to finish.
Record availability at each admission. The declared container limits can exceed
physical memory in aggregate, so this is observed-load admission, not a promise
of four simultaneous 2-GiB reservations. Preserve OOMs and contention in results.
Latency is full agent wall time; report concurrency/resource contention limits.
Rotate arm order per task. All workspaces and model histories are fresh.

Stop admissions at <=40% weekly remaining, unreadable quota, unknown inference
cost, operational failure, or $10 known campaign spend; already active attempts
finish. The campaign spend stop is not a per-stage inference limit. Never reset
quota, retry based on outcomes or replace failures. Preserve any incomplete costs.

Before paid work, freeze current and baseline runtime inputs, dependency tree,
check/data/task hashes, configuration and plan. Probe infrastructure and negative
controls in disposable containers; run an install-only Harbor preflight. Test
positive/negative checker fixtures without hidden evaluator files or solutions.
Official grading happens only after actor shutdown. No grader feedback reaches
planning, repair, routing or the shared core. Frozen past scores stay unchanged.

Report correctness, policy validity, public verification, cost per accepted task
including failures, full stage cost, latency, cache usage, model/tool calls,
output/visible-text volume, assistance activation and every same-task regression.
Four paired tasks with one repetition are diagnostic evidence, not a general
accuracy estimate or basis to enable production defaults. Fixes are general
verification/communication behavior, not patches tailored to private cases.

Prompting reference: official OpenAI deployment checklist recommends evaluating
verbosity controls separately from reasoning effort and specifying required
content explicitly. This pinned adapter has no verbosity control exposed here;
the experiment therefore uses an opt-in prompt instruction and measures it.
https://developers.openai.com/api/docs/guides/deployment-checklist
