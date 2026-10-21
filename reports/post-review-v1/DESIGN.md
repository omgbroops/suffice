# Reviewed held-out comparison design

The user authorized proceeding on October 20, 2026. The concrete selected cohort,
pre-inference amendments and actual launch conditions are in CAMPAIGN-PLAN.md.
The following records the reviewed proposal; the cohort manifest records the
subsequently frozen inputs. No historical benchmark scores were replaced.

## Question and single treatment

Does one Sol Low post-implementation review plus at most one Luna repair increase
independent acceptance per dollar over Luna alone, while approaching Pi/Sol quality?
This is a small prospective experiment, not a release decision or broad benchmark.

The opt-in prototype is `strategy: "efficient-review"`, `experimental: true`.
Luna High implements over the existing efficient core, then fixed public checks run.
Sol Low receives the original task, an actual source patch against the clean initial
Git HEAD, non-ignored new file contents, and public verification evidence. The review
runs on pass, failure, unavailable evidence, or no configured checks, subject to
shared time/cost allowance and packet support. It has no tools or context-file loader.

Sol returns strict JSON: approve with no corrections, or correct with 1–5 relative
file paths and actionable corrections. Only correct permits one Luna High repair.
Checks run again afterward. There is no second review, takeover, upfront advice,
failure-triggered advisory stage, or additional repair loop. Approve does not
override a failed/unavailable public check, and repair completion does not imply
that Sol approved the repaired artifact or independent acceptance.

## Bounds and accounting

- One accounted reviewer response, maximum 60 seconds and $0.03 API-equivalent review allowance within the shared task budget.
- The model cost guard operates between responses: one response may overshoot. Its full measured cost is retained and stops repair. This is not a guaranteed hard billing cap.
- Review input is at most 48,000 UTF-8 bytes; oversized packets stop explicitly rather than silently dropping changes. Review reply is at most 8,000 characters and must satisfy the schema.
- The worker uses unchanged Luna High effort. All worker/reviewer/repair usage shares the existing task cost, response, tool and time allowances. No stage is recorded as free merely because an incomplete receipt is missing.
- Stage JSON records model, effort, usage, cost, time, response/request counts, errors, and final text. Aggregate usage counts each stage once. Saved review-input/review JSON separates supplied evidence, decision and repair status.
- No inference happened during implementation or local validation. No new benchmark scheduler or paid launcher has been added.

## Prototype support limits

The initial workspace must be a clean Git repository at its root, with an existing
HEAD. No Git initialization, commit, dependency installation, or workspace cleanup
is performed by the strategy. A changed HEAD, dirty initial tree, oversized diff,
binary patch/new file, or unsupported new-file type stops explicitly. A malformed
or unavailable review is not approval and cannot fund repair. No implicit retry is
used for a malformed review; existing transport behavior remains unchanged.

The patch covers tracked changes, deletions, staged changes and non-ignored new
files; it does not review ignored outputs, installed services, arbitrary external
files or binary state. This prototype therefore targets source-change tasks.
Task-required external state must have explicit public verification if later tested.
Do not launch it on the old system-configuration cohort and imply full coverage.

## Proposed cohort and controls

Propose **six fresh tasks × three arms = 18 attempts**, one predeclared attempt per
pair. Task IDs and manifests are intentionally not selected/frozen until this
diagnosis and design are reviewed. Select source-change tasks not present in any
previous Suffice campaign, using only issue text, initial public repository and
public tests. Following the user's JS/TS focus, restrict this pilot to **six
JavaScript/TypeScript issues**, aiming for four TypeScript and two JavaScript
issues across at least three repositories. Cover two async/lifecycle/retry issues,
two API/type/compatibility issues, and two changes spanning module boundaries.
These describe selection strata, not selected task IDs or invented issue reports.
Actual issues must be identified, checked for eligibility and frozen before any
model run. Favor executable existing project checks and independently prepared
issue-contract grading. Do not select based on whether Luna fails or a reviewer
can fix a known defect. If these strata are infeasible, document the selection
amendment before inference rather than replacing tasks after outcomes.

This is a deliberate evaluation of Suffice's intended JS/TS workflow and AST
navigation, not a replacement or reweighting of previous mixed-language results.
All three arms get the same eligible issues; include regressions and report only
JS/TS-scoped conclusions. Six outcomes cannot establish general coding accuracy.

| Arm | Fixed configuration |
| --- | --- |
| Luna alone | Luna High, same efficient core/input/tool configuration, no Sol and no automatic controller repair. Worker can use normal tools/tests during implementation. |
| Luna + post-review | Identical solve configuration, then the one Sol Low review and at most one review-requested Luna High repair. |
| Stock Pi/Sol | Stock Pi 1.2.0, GPT-6.1-Sol High, standard tools/prompt. Public instructions/check commands identical. |

Disable the old Luna control's automatic public-failure repair to isolate this
review-plus-one-repair bundle. We are not separately estimating review versus the
extra repair opportunity; that would require another arm, outside this proposal.
Pi is a quality/cost reference rather than a same-model ablation. Do not change
prepared context, output control, notices, concise prompting, effort scheduling,
or caches between the two Luna arms. Use the same original public task text, public
test access, service tier, whole-task caps and environment resources.

Proposed allowance: $1 per attempt, 100 model responses, 240 tool calls, original
task wall-clock limit, and a $10 aggregate known-spend admission stop. Stop admission
on unknown costs, provider interruptions or unreadable/<=40% weekly quota; already
admitted work may finish, so the admission stop is not a hard spend ceiling.
The user must review these proposed limits with the design before paid execution.

Fresh histories/workspaces, balanced arm order, at most two active model jobs, and
resource-aware grading separation. Run project tests and public-contract negative
controls before inference. Freeze initial Git identity, public-only file manifest,
tools, models/efforts, prices, checks, timeouts and source/dependency hashes.
Private graders live outside actor/reviewer workspaces; they run only after all
model work for that attempt stops. The runtime must not mount research reports,
prior receipts, hidden tests or reference patches.

## Outcomes and decision rule to freeze before launch

Primary: total measured API-equivalent spend divided by independently accepted
tasks, including rejected attempts and all review/repair stages. If zero tasks
are accepted, cost per accepted is undefined/infinite, not zero. Also report
accepted count and cost per attempted task; a cheap policy with worse acceptance
does not automatically win.

Report paired gains/regressions, public-check disagreement, reviewer decisions,
review/repair activation and costs, model/tool calls, cache/output tokens, agent
latency, grading time, unknown costs and provider/grader failures. No outcome-selected
reruns. Preserve original ungraded records; any infrastructure replacement requires
a separate predeclared policy and retained incurred-spend ledger.

For this diagnostic pilot, advance only if review yields at least one net additional
accepted task versus Luna-alone and a lower total cost per accepted task, with
complete cost accounting and no unresolved grading discrepancy driving that gain.
If review improves acceptance but increases cost per accepted, report the tradeoff
and do not claim the stated objective was met. A six-task pilot is too small for
a reliable general accuracy estimate or production promotion even if it passes.

Inspect approval of incorrect implementations, useful correction misses, repairs
that did not resolve the issue, and harmful corrections separately. Do not feed
those hidden grader outcomes back into a replay on the same tasks. Future tuning
requires a separate development set and a new held-out evaluation.
