# Independent context screen review

Reviewed the 18 raw v4 result files, their events and selected transcripts, the frozen v4 harness, and the current v5 stable-context implementation. No provider calls or frozen-source edits were made.

The v4 failures indicate loss of working state and repeated task restarts in this implementation. They do not establish that model-based context selection is ineffective. The policy retained only one recent complete group, frequently removed the early README contract, and appended an omission notice as a new user message on every pruned request. Those changes are confounded with the selector itself.

| V4 arm | Operational outcome | Acceptance | Turns | API-equivalent total USD | Relevant observed intervention |
| --- | --- | --- | ---: | ---: | --- |
| core | Completed | 4/4 passed | 4 | 0.0287784 | Full history |
| cache-select | Completed | 4/4 passed | 4 | 0.0182712 | Zero pruned requests; forecast vetoed both opportunities |
| graph | Completed | 4/4 passed | 4 | 0.0200328 | Four supplemental evidence injections |
| delegate | Completed | 4/4 passed | 4 | 0.0274296 | Two exact-quote injections; auxiliary inference cost 0.008186 |
| luna-worker | Completed | 4/4 passed | 7 | 0.00134306 | Luna remained the main worker |
| route | Completed | 4/4 passed | 5 | 0.0333294 | Switched to Sol at the first codemode call, before nested reads |
| select-luna | 180-second timeout | 4/4 passed | 20 | Unknown | Seventeen pruned requests; repeatedly retained stale source group g3 |
| select-jev | Tool limit | 4/4 passed | 21 | Unknown | Nineteen pruned requests; repeatedly retained stale source group g3 |

In select-luna, the first edit-and-test batch completed at approximately 31 seconds. Later turns reattempted already-applied edits, failed on mismatched old text, reread source, and reran tests instead of finishing. Its final workspace passed all acceptance tests. Select-jev showed the same repair-without-completion pattern and also passed all acceptance tests after exceeding the tool budget. These are operational failures, not acceptance failures. Known main-cost components alone were approximately 0.1676012 and 0.16233 respectively; the unknown total is not zero.

Select-rules and threshold compact repeatedly alternated contract/source reads, retained essentially only the latest group, and reached 81 tool calls without fixing the task. Select-lightning and select-nemotron abstained on four selector calls each and followed similar loops. Select-gemma completed successfully after two HTTP 429 selector errors caused full-history fallback; that is evidence for fallback availability, not successful selector treatment.

The v5 stable modes address several plausible mechanisms: they protect the first complete group and two recent complete groups, raise the deterministic budget to 20,000 characters, exclude thinking from selector candidate excerpts, and append omission metadata to an existing tool result rather than a new user message when possible. These changes form a bundle; a future improvement cannot be attributed to any one change without separate controls. Historical selections remain fixed after four selector calls, so stale retained source evidence can still outlive the edit/test history. When no tool result exists, the implementation still falls back to a user-role notice.

At the read-only review snapshot, v5 core and stable-rules had both completed in four turns. Stable-rules pruned zero messages on every request: the first-group and two-recent-group protections covered all three historical groups. Its successful smoke therefore verifies the baseline path, not active pruning. A longer task or continuation is needed to exercise the changed replacement behavior.

Methodological limits:

- V4 used one synthetic task and one repetition per arm, run sequentially. This does not establish general accuracy, latency, or cost rankings.
- Provider cache warmth was uncontrolled. Cache-select had 6,912 cache-read tokens versus core's 1,024 and pruned nothing. Its lower observed cost cannot be credited to context replacement.
- All 15 original source files had at most 14 lines. The 35-line bounded default did not need to truncate those files, so its observed benefit is not evidence for bounded reads.
- Graph and delegate added evidence while the worker also read the source. Single-run outcomes do not establish that injections caused the success or cost differences. Delegate latency was approximately 66 seconds versus core's 34 seconds.
- Routing treated every codemode call as work, including a read-only batch. The observed run mostly used Sol; it does not test sustained cheap-model reading followed by a later reasoning promotion.
- Threshold compact pruned original groups; it did not generate a conventional summary. Its outcome should not be generalized to summary compaction.

Evidence: [v4 manifest](../.suffice/runs/context-screen-v4/manifest.json), [frozen v4 harness](../.suffice/runs/context-screen-v4/frozen-source/src/harness.mjs), [select-luna events](../.suffice/runs/context-screen-v4/008-inventory-reservations-select-luna-r0/events.jsonl), [select-jev result](../.suffice/runs/context-screen-v4/009-inventory-reservations-select-jev-r0/result.json), [stable-rules smoke result](../.suffice/runs/context-working-smoke-v5/002-inventory-reservations-stable-rules-r0/result.json).
