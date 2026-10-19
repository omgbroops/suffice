# Generic Medium accuracy treatment

The parent experiment was checkpointed in eleven logical local commits on `codex/suffice-v7-experiments`, ending at `cee2fc2c77ad10229cc922b5a8c38a0f865060d5`. `codex/suffice-medium-accuracy` starts at that exact commit. Four implementation/documentation/orchestration commits end at `b7eaeac4f4684fb7b5deb1036a4f89d5e68133c4`, the pre-inference freeze checkpoint. Nothing was pushed or merged.

The original pipeline, packet and CLI executable files remain unchanged. New behavior lives in `src/accuracy/`, with a separate opt-in `npm run accuracy` entrypoint. Normal CLI behavior is preserved.

## General treatment

- Compact implementation instructions ask the worker to examine public documentation, callers and tests and preserve behavioral invariants.
- A fresh same-model Luna Medium session reviews current source and the actual patch even when public checks pass. Its tool surface permits reads, AST navigation and fixed-argument change retrieval, with no shell or editing tools. Git baseline identity is captured before any model implementation, so later worker commits cannot hide changes.
- A strict verdict requires observed source and patch evidence. Revision findings must quote text actually returned by a source read and still present in the current file. This is structural evidence validation, not proof of a semantic diagnosis.
- Supported findings allow one same-Medium correction and public recheck. The final state is honestly `revised_unreviewed`; malformed, unsupported, missing or interrupted review remains inconclusive and ineligible. Model review is never called independent acceptance.
- All stages share the original dollar/time/response/tool allowance. Review defaults to six responses, 24 tool calls, $0.01 and 60 seconds. Dollar/time sublimits are configurable; the replay pins defaults. Cap hits and causes, overshoot, unknown costs, complete usage and unsuccessful stages remain visible.

The implementation agent was given source/synthetic-test scope without the benchmark conversation and instructed not to inspect historical task, patch, grader or result artifacts. Implementation review likewise used only source and unrelated synthetic cases. No issue-specific APIs, expected patches or grader diagnostics were added to treatment instructions. This instruction/scoping record is not a claim of an OS-enforced development-data boundary.

## Verification before inference

`npm test` passed **78/78**, including **22 new offline accuracy cases**. Coverage includes review after green checks, source/diff evidence, hallucinated or stale findings, strict JSON, read-only tool restrictions, one correction and recheck, exact cost conservation, response/tool/time/dollar limits, overshoot, unknown provider usage, disabled-path parity and worker commits after the pinned baseline. Real offline Pi/codemode execution verifies the review surface without paid inference.

Independent implementation and orchestration reviews found no remaining concrete blocker after baseline pinning, empty-diff evidence, acceptance-label and cap-metadata fixes. Existing frozen source is byte-preserved. Detailed preservation and source hashes are in `verification.json`.

## Evaluation boundary

The authorized replay runs three new attempts using the same public prompts and independent graders as before. It is frozen before inference and receives no outcome-based tuning or automatic reruns. Those tasks are already exposed development cases; comparisons with earlier Medium/High runs are historical, not contemporaneous randomized controls. The new prompt and review are a combined treatment, so a score change alone cannot isolate their individual contributions.

This report documents implementation readiness, not improved model accuracy. Replay results are written separately under `reports/accuracy-bench-v1`. Source changes originate locally and are hash-synced to an isolated Sonion checkout under `eric_qin`.

See [configuration](../../docs/MEDIUM-ACCURACY.md) and [frozen replay protocol](../../benchmark/accuracy-plan.md).
