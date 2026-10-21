# Authorized JS/TS pilot, October 20, 2026

The user reviewed the diagnosis/prototype/design, requested a JS/TS focus, then
authorized proceeding with the six-task/three-arm experiment. No new product
features are part of this campaign. All 18 attempts are fixed before inference.

## Selected public reports

| ID | Repository issue | Public behavior | Source kind |
| --- | --- | --- | --- |
| queue-aborted | https://github.com/sindresorhus/p-queue/issues/241 | An already-aborted queued task must reject without waiting for capacity. | TypeScript |
| queue-timeout | https://github.com/sindresorhus/p-queue/issues/250 | Validate invalid per-task timeout options before executing the task. | TypeScript |
| ky-progress | https://github.com/sindresorhus/ky/issues/878 | A finished empty streamed response must report completed download progress. | TypeScript |
| ky-signal | https://github.com/sindresorhus/ky/issues/879 | Replacing/removing an extended instance's signal must discard the parent signal. | TypeScript |
| pall-types | https://github.com/sindresorhus/p-all/issues/15 | Infer result types for mapped promise factories without requiring an async workaround. | JavaScript library with declarations |
| emitter-value | https://github.com/primus/eventemitter3/issues/281 | ESM declarations must allow importing and instantiating EventEmitter as a value. | JavaScript library with declarations |

These span **four repositories**, not five. Earlier candidate selection included
other repositories; those candidates were rejected before inference. We searched
saved reports/configurations across Suffice and its parent experiments repository
for previously mentioned issue URLs. The selected six were absent; several p-map
and p-queue candidates were excluded because earlier experiment reports used or
discussed them. This is a conservative local history check, not proof that a model
never saw an issue in pretraining.

The original target of two async/two API/two cross-module tasks was amended before
freeze: this reproducible small cohort emphasizes cancellation/options/progress
and declaration compatibility. It is not representative of all JS/TS issues or a
controlled test of the AST feature by itself. Three of the four repositories are
in the same maintainer ecosystem. Two tasks focus on declarations rather than
JavaScript implementation edits. Those limitations must accompany the results.

Base revisions are the latest default-branch commits before the original issue
creation timestamps, pinned in `benchmark/post-review/candidates.json`. Source
archives contain no later fixes/history. Prompts retain the problem and available
reproducer, omitting suggested-fix/root-cause sections and fix links. This is an
adapted issue task, not a claim to reproduce an upstream benchmark. All arms see
exactly the same task text and public command.

## Controls and grading

Before model calls, both public and independent issue-contract checks must reject
each unchanged base for the intended behavioral/type failure. Independently authored
minimal contract-positive source fixtures must pass both. They are disposable
checker controls, not upstream gold solutions or proof that every existing project
contract is covered. Their patches never enter actor/reviewer workspaces.

Type checks use pinned TypeScript 5.9.3. Runtime checks use deterministic custom
fetch responses and finite queue gates rather than live remote HTTP. Public
checks rebuild TypeScript output before checking so stale compiled files do not
masquerade as current source verification. Independent checks include additional
public-contract variations and ordinary-operation controls; these are withheld
until the actor exits. They are independently authored issue-contract grading,
not official Terminal-Bench grading and not a full correctness certificate.

Preflight discovered a package-lock-disabled repository and an expected AbortError
that initially escaped a test assertion; both were fixed before inference. Installed
package manifest trees and immutable Docker image IDs are recorded instead of
claiming a nonexistent package lock. The p-all positive fixture initially used
an overly broad any type and correctly failed the negative-type assertion; the
final fixture uses an inferred generic result type. No actor outcomes informed
these changes. Failed preflight evidence is retained in campaign preparation logs.

Images pin source and installed dependencies. Frozen runtime/task/check hashes,
initial Git HEADs, environment identities, preflight evidence and balanced arm
ordering are recorded before the first model response. Public checks are mounted
read-only; grader code is injected only after model work stops. Past reports and
reference controls are not mounted to actors. The task containers use 1 CPU/2 GiB.

## Model policies and limits

- Alone: Luna High with the existing efficient core, no advisory calls or automatic post-completion repair.
- Review: identical Luna High solve, then one tool-free Sol Low response even when public checks pass; at most one Luna High repair, and recheck. Existing $0.03/60-second reviewer allowance and 48,000-byte packet cap apply.
- Pi: stock Pi 1.2.0, GPT-6.1-Sol High, stock prompt/tools.
- Shared whole-attempt limits: $1 API-equivalent estimate, 100 responses, 240 tool calls, 600-second agent phase. Guards are checked between responses; overshoot remains charged.
- At most two simultaneous task containers; preserve unrelated containers. Stop admission on unknown costs, provider/operational interruption, <=40% weekly remaining, unreadable quota, insufficient memory, or $10 known aggregate spend. Admitted attempts may finish. No usage reset or automatic whole-attempt replacement.
- Six tasks, three arms, one attempt per pair. Failed/ungraded attempts and all review/repair spend remain in the denominator/ledger.

Use the previously reviewed advancement rule: at least one net additional accepted
task and lower total cost per accepted task versus Luna-alone, with complete
accounting and no grading discrepancy driving the gain. Report paired regressions,
review decisions and ineffective/harmful corrections. A successful small pilot
does not justify a production-default switch.
