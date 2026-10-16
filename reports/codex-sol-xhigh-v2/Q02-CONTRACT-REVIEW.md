# q02: contract-sensitive rejection, not an undisputed capability failure

The native Codex attempt completed and passed all four issue-specific acceptance checks, TypeScript and tsd. It failed exactly one restored original native test, `should emit next event when completing task`. It had changed that test, the implementation and the README to broaden `next` to include task starts, while avoiding duplicate completion/start notifications. The frozen primary rejected score remains unchanged.

The pre-fix README and original test define completion-driven `next` behavior. The upstream reference fixes the waiting promise by listening to both `next` and `active`, leaving that behavior intact. Thus a compatible implementation exists, and the frozen test is a genuine, publicly available contract check, not a secret demand for particular code structure.

However, the original GitHub issue also proposes emitting `next` after dequeueing and infers that it should signal a shrinking waiting set. The proposed direction conflicts with the older documentation/test. Codex's patch follows that suggestion and updates the affected documentation/test. The issue's desired promise behavior is unambiguous; whether its suggested event broadening is authorized is less clear. It is too strong to describe this sole difference as an unequivocal model or harness capability failure.

Conservative interpretation: report the primary grade exactly as frozen, describe the backward-compatibility divergence, and show a separately labeled nine-pair sensitivity excluding q02. Do not silently accept Codex retroactively, alter any actor/grader, drop its costs, or claim the sensitivity is a predeclared fresh benchmark. All ten issue attempts per harness remain in the main dataset and cost ledger. The exclusion is a post-outcome contract review and must be visible.

This also qualifies earlier descriptions of the same q02 Pi rejection. Those original grades and receipts remain immutable; their interpretation as an undisputed capability gap is too categorical given the public issue suggestion. No other previously accepted patch is automatically reclassified.

The parent operator reviewed the issue, original test/README, source patches and grading receipts. This is independent of the coding actors, but is not a second human adjudicator. No clarification was requested from the maintainer, no upstream message was sent, and no actor received this review.

Source: [original p-queue issue #249](https://github.com/sindresorhus/p-queue/issues/249), checked against the saved original body and current GitHub page. Supporting local evidence: task `q02/task.json`, `private/reference-production.patch`, native Codex `tracked.patch`, and its `grade/native-0/process-stdout.txt`.
