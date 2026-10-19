# Broad open-source pilot v1

Authorized after the user reviewed the three-task replay and asked to run the
15-issue comparison on Sonion with as much practical concurrency as possible.
Thread transfer was cancelled before import or remote inference; that task is
not part of this campaign.

## Frozen systems and allowance

Four arms on each of 15 new-to-this-evaluation historical issues (60 attempts):

| Arm | Runtime | Worker | Effort | Additional stages |
|---|---|---|---|---|
| codexSolMedium | Pinned native Codex 0.163.0 | GPT-6.1-Sol | Medium | Native behavior |
| v1SolMedium | Preserved Suffice baseline | GPT-6.1-Sol | Medium | No routing |
| v2LunaHigh | Preserved thin pipeline | GPT-6-Luna | High | Existing failure-triggered Sol Low advice, bounded ordinary repair, conditional Sol Low takeover |
| v1LunaHigh | Preserved Suffice baseline | GPT-6-Luna | High | No routing |

The v2 treatment matches the prior High configuration; mandatory compatibility
review and its new initial instructions are excluded. No harness source changes
are allowed in response to scored results. Baseline and thin entrypoints remain
byte-identical to parent commit cee2fc2. Sol Medium is an intentional stronger
baseline than the earlier Sol Low pilot, not a continuation of its exact model
settings.

Each attempt shares a $0.25 API-equivalent allowance, 300 seconds, 40 model
responses, 160 tool calls and 4 GiB process-tree RSS across every stage. Native
Codex retains its own prompt and tools; instrumentation observes usage and
enforces the same external allowance. The nominal reservation is $15 with a
$16 campaign dispatch ceiling. Provider responses can overshoot a dollar cap;
overshoot is included and never silently clipped from accounting. Engineering
inference and dependency/control preparation are outside actor API spend.

## Cohort preparation and acceptance

Use 15 issues across at least ten repositories, no more than two per repository.
All previously used repositories are excluded, providing a stronger exclusion
than merely omitting previously scored issue numbers. This cohort focuses on
JavaScript/TypeScript Node projects; do not claim cross-language breadth.
Historical public issues may have appeared in training. Fresh means unused by
our previous harness development/evaluation, not guaranteed training-unseen.

Preparation agents inspect original issue bodies, public source/API contracts,
and upstream fixes. Coding actors receive the original issue title/body and
prevalidated public commands, without fixing commit IDs, private tests or
solution comments. Base/fix archives, dependency locks, graders, reference
patches, prompts, sources and catalogs are hashed before inference. Every actor
Git repository exposes a single synthetic base commit; no upstream history or
fixing commit is reachable.

Every candidate must pass original public checks, fail the independently authored
behavioral acceptance cases, and pass those cases with the reference production
patch. Public checks must also pass in a pristine networked actor boundary.
Prepare and validate the entire cohort before dispatching paid attempts. Replace
or amend broken candidates only before any scored model result; retain the
preparation failure and reason. After final cohort freeze, never substitute a
task based on model success. Grading restores protected public test files before
running original project checks, then mounts private acceptance fixtures only in
the separate grading workspace. Graders test requirements rather than patch
similarity. Test-writing agents are separate from coding actors.

## Concurrency, isolation and accounting

Run at most four issue blocks concurrently, with each issue's four arms in
counterbalanced order. Do not run multiple arms of an issue simultaneously.
Limit controls to two concurrent jobs. Require at least 2.5 GiB MemAvailable
before admitting a new issue attempt, with a locked admission decision. Retain
memory-wait timing separately from actor latency. Remove the transport's old
two-core pin; preserve process limits and use the available CPUs. These are
ceilings, not a promise that all four slots remain occupied.

Reuse the reviewed bwrap filesystem/network boundary and native worker observer
with explicit per-arm model/effort parameters. Freeze the local canonical files
and verify the remote copies and mounted runtime. Keep private task preparation
outside all actor mounts; do not grant broader host access to speed up a task.

Record all attempts including timeouts, failed grades, capped work, interrupted
calls, advice, repairs and takeovers. Unknown usage or an identity/isolation
failure stops new dispatch and preserves current receipts. Never silently rerun
an attempt or overwrite a partial attempt. Resume only confirmed unstarted jobs;
any infrastructure amendment receives a separate record and unchanged actor
outcomes remain retained.

## Reporting

Report independent patch acceptance separately from operational/budget
eligibility. Include total cost and cost per accepted task (failed spend included),
unknown-cost counts, mean/median/tail latency, model/tool calls, fresh/cached/output
and reported reasoning tokens, process RSS, actual routing activations, and paired
per-issue outcomes. Distinguish provider request intervals from model compute.
The same-Luna control helps separate v2 behavior from model-price effects;
individual v2 features are not isolated by this pilot. Fifteen issues with one
attempt per arm/issue is a broader pilot, not a precise general accuracy claim.

Keep source and evidence on both machines through hash-checked transfers. Do not
push, merge, enable features by default, or edit the original Suffice checkout.
