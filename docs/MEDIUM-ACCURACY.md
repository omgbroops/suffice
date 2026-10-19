# Medium compatibility-review experiment

This branch develops a general accuracy treatment for the existing opt-in pipeline. The parent is `codex/suffice-v7-experiments` at `cee2fc2c77ad10229cc922b5a8c38a0f865060d5`, after eleven local commits preserving the preceding work. Original `src/pipeline` code and prior frozen experiments stay unchanged. The normal Suffice CLI is unchanged.

## Hypothesis and independence

Passing an existing project's tests is useful evidence, but does not establish that a change preserves every relevant public behavior. The proposed treatment asks a fresh instance of the same Medium worker to examine the actual change against public requirements, documentation, callers and tests before completion. It uses a general public-contract prompt, not issue-specific hints or benchmark-derived examples.

Implementation and synthetic controller tests must not read benchmark tasks, historical patches, independent grader contents or prior failure diagnostics. Synthetic cases concern unrelated behavior such as cancellation cleanup and numeric/default semantics. All implementation decisions, synthetic test results and review limits are frozen before the three requested development replays begin. No changes or retries follow acceptance feedback.

This is an attempt to improve accuracy. Synthetic tests establish controller behavior and accounting, not improved model accuracy. The three historical replay tasks are already exposed development cases; even a better replay score requires confirmation on fresh tasks and repeated runs.

## Treatment

The research entrypoint is `npm run accuracy`, accepting the same JSON input/auth convention as `npm run pipeline`. Use `experimental: true`, a new external receipts directory, the thin profile, and Luna Medium. The accuracy mode requires a Git working repository with a committed baseline. An explicit `accuracy: false` delegates to the original pipeline, including its original defaults.

For a normal pipeline request, add these optional top-level settings to pin the review allowance:

```json
{
  "model": "gpt-6-luna",
  "effort": "medium",
  "maxReviewCostUsd": 0.01,
  "reviewTimeoutMs": 60000
}
```

The complete request still needs `experimental`, `workspace`, `runDir`, `prompt`, and appropriate public `checks` as described in [PIPELINE.md](PIPELINE.md). Review responses and tools are limited to six and 24 respectively. The dollar and time sublimits are configurable; the replay pins the defaults before inference. A higher explicitly supplied dollar sublimit still shares the overall task budget.

Initial implementation receives compact generic instructions to inspect relevant public contracts and preserve behavior around the requested change. After normal implementation and public verification, a fresh Medium reviewer receives bounded change evidence and read-only source/navigation tools. It has no shell or editing tools. Public checks passing does not skip review.

The reviewer returns a bounded structured verdict with source-backed findings. Missing evidence or malformed output is inconclusive, not an invented pass. At most one normal Medium correction follows supported findings, followed by public checks. A corrected result is explicitly `revised_unreviewed` unless a separate review actually occurred; the treatment does not claim private acceptance or silently install another review loop.

Finding validation establishes that the quoted evidence was actually read and remains in the current file; it cannot prove that the model's semantic diagnosis is correct. `reviewStatus`, `reviewCorrections`, `reviews`, per-stage `reviewer`, `capHit`, and `stopReason` make these distinctions inspectable. `compatibilityReviewPassed` describes the model review only; an independent grader still determines actual acceptance.

## Cost and evidence

All solve, review, correction, advice and takeover usage draws from one global dollar/time/response/tool allowance. Default review sublimits are $0.01, six responses and 24 tool calls. Those are ceilings, not charges; actual raw usage and price-catalog receipts determine the cost. A provider response can overshoot a dollar ceiling; the spend remains recorded and the attempt is ineligible. Missing usage stays unknown and stops further paid work.

Archive every review verdict, source-evidence validation, correction, check, model identity, response, failure and partial output. Report the additional review/correction cost separately as well as complete cost per accepted task, including failed attempts. Inconclusive reviews must remain visible in acceptance/eligibility reporting.

The authorized replay comprises three new attempts on the same tasks as the earlier effort experiment, using the same public prompts and independent graders. Historical Medium and High runs remain historical comparators, not contemporaneous controls. All harness changes originate locally and are hash-synced to a separate Sonion checkout under `eric_qin`; no remote-only fix is permitted. The broader 15-issue evaluation is separate.
