# Queue cohort preparation

Selection was made before control execution, using original public engineering contracts and state/API complexity. Tasks are fresh historical issues; prior work was unscored metadata screening, and no scored model call is made by these preparation scripts.

- q01: sindresorhus/p-queue#251, fixed-window rate-limit state after the queue goes idle. Four upstream issue-specific regressions test fresh capacity and preservation of the cap; new strict-mode/re-entrant regressions in the same upstream commit are outside acceptance. The verbatim public body includes a detailed root-cause diagnosis; this is disclosed, not stripped.
- q02: sindresorhus/p-queue#249, asynchronous queue-size observers across start(), concurrency changes and interval ticks. Acceptance includes four public settlement behaviors. The upstream assertion that exact event listener counts become zero is excluded to avoid constraining implementation. The verbatim body includes a proposed event-based repair direction.
- q03: sindresorhus/p-queue#168, running/waiting cancellation and queue pending-count recovery. The upstream simultaneous-abort test follows the original report's public queue contract. The production-only reference omits upstream package/tooling changes, so it must pass with the pre-fix source, package and tsconfig to qualify.

Not selected: #255 and #256 are narrower defects whose original public bodies link already-tested patches and implementation directions; #168 provides a broader older cancellation state problem. Selection was not based on actor outcomes or measured repair difficulty.

Runtime: shared WSL Node v24.15.0; upstream package engines admit Node24. Canonical source paths and original native test runners are retained. Modern tasks use repository tsx+node:test, TypeScript compiler and tsd; older task uses repository ts-node+AVA and compiler. Every base derives from a freshly downloaded exact-parent archive. Issue/commit API JSON, original body, source archive, source hash, frozen generated lock and control receipts remain under each task's private evaluator directory. Actors receive only original title/body and common environment policy.

No frozen general-v1 files or configuration are changed. No upstream actions or scored model calls are performed.
