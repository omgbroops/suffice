# Shared core v1: frozen before paid actor inference

Four historical public issues, fresh to our previous local campaigns:
p-debounce #34, p-memoize #62, p-timeout #45, p-retry #97. All are small async
JavaScript/TypeScript utilities from one maintainer. Full public issue bodies
include suggested repairs. This is an easy, narrow pilot; no training-unseen or
cross-language generalization claim. p-retry #100 was excluded before inference
because its requested fractional-retry behavior conflicts with the proposed fix.

Two independent strata: GPT-6.1-Sol/medium and GPT-6-Luna/high. Compare arms only
within a stratum. One fresh session per issue/arm; 48 attempts total. All use the
V1 prompt, codemode/AST, pinned Pi dependencies, cache settings and public sources.
No thin prompt, guidance, runbooks, routing, expert planner or Sol takeover.

Arms: B original V1 session; O output recovery only; V public contract verification
plus at most one same-model/same-effort repair; OV both; P prepared context only;
N soft advisory notices only. V measures a verification-and-repair policy bundle,
not verification CPU time alone. Native project checks run in every controller.
All actors can inspect/run the same read-only public reproducer scripts. Only V/OV
automatically execute them and use their failures for repair. Independent grading
never feeds any actor/controller. Failed attempts are retained, never replaced.

Public and private checks are authored before inference from public contracts;
production upstream patches are reference positive controls only. Private checks
vary arguments/reasons and exercise ordinary compatible behavior. Same author
prepared and reviewed assertions; this is not a blind independent reviewer study.
Original repository tests are restored when grading. Acceptance requires project
checks, the public reproducer and the separate variants. Baseline must fail issue
acceptance; reference must pass. p-memoize uses a synchronous TypeScript test loader
to execute all 25 existing tests, including decorators. Its full upstream patch
fails an unrelated existing cache-clear error-message assertion. Preserve that
failed control and use a focused one-line microtask deferral, suggested by the
public issue, as its positive control; no test assertions are weakened. Earlier
tsimp preparation smoke runs did not execute substantive tests and are rejected.
Syntax/style/type packages are not a full npm-test claim.

Limits: $0.25 API-equivalent per attempt, 300 seconds, 40 model responses, 160
tool calls, 4 GiB aggregate RSS, concurrency 2. Cost is a response-boundary cap,
so one response can overshoot; preserve it and stop new campaign admission if the
$12 campaign allowance is exhausted. Unknown costs/identity mismatches stop new
admission for inspection. Include all retries/repairs/preparation in run latency
and all model replies in cost. Independent grading and dependency setup are
reported separately, not charged to actor model cost. Engineering inference is
not campaign cost. Retain fresh/cache/output/reasoning tokens, calls, feature
activation/retrieval and both inner/outer latency. Counterbalance arm order by
issue; alternate model strata. Freeze source/task/lock hashes and model prices.

No default changes follow a four-issue tie. Report paired deltas and regressions,
including added tool-schema/prompt cost and features that never activate. Public
contract coverage is not semantic completeness. Do not use hidden test feedback,
adapt harnesses to failed graders, or relabel failures as successes.
