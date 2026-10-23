# v7: test-first pipeline with per-stage scoring

Why: r27 deep dive (2026-10-22). Opus passed all 22 tasks it attempted. Our cheap arms fail because the gate believes weak checks
(v5b: 7 of 10 misses were `node -e` / `cargo test` with 0 tests / gradle NO-SOURCE; never escalated). v6's blind writer helps,
but its tests were sometimes wrong (cpp_sublist, cpp_phone-number, java_pig-latin failed for every candidate incl. Sonnet).
v7 stacks independent checks and logs how useful each one is, so we keep only the stages that pay.

## Stages (each switchable: `--v7-stages=plan,blind,coder,probe,sblind,review`)

| # | Stage | Model | Sees | Output |
|---|---|---|---|---|
| 1 | plan | Haiku, read-only | task, file tree | requirements, ambiguities, edge cases, pitfalls, approach (<=300 words) |
| 2 | blind | Haiku, own scratch copy | task + plan, no solution | test file A + `SELFTEST:` cmd |
| 3 | coder | Haiku | task + plan, test file A present | solution; runs A |
| 4 | probe | Haiku, fresh chat | task + the code | test file B aimed at the code's weak spots; no source edits |
| 5 | sblind | Sonnet, own scratch copy | task only (no plan, no code) | test file C + cmd |
| 6 | review | Sonnet, Read only | task + code | `VERDICT: PASS` or `VERDICT: FAIL` + up to 5 concrete defects |

Gate = every test cmd exits 0 AND `testsRan()` (>=1 test ran) AND review PASS.
On a failed gate: up to 2 Haiku fix rounds (all failing tails + review defects), then 1 Sonnet fix round. Fixers are told a test may
itself be wrong; a fixer may edit a test only if it states `TESTBUG: <file>: <reason citing the task text>`; that claim is logged.
After the fix rounds the gate re-runs (all test files + review) and the row records `selfFinalPass`.

## Scoring (the point of v7)

The hidden verdict is taken after the coder and after every fix round, for logging only; no decision ever reads it.
Each row stores per checkpoint and per check: `{stage, check, flagged, hiddenPass, costUsd}`.
`scripts/v7-stage-value.mjs <results.jsonl>` prints per check: caught (flagged & hidden fail), false alarm (flagged & hidden pass),
missed (not flagged & hidden fail), cost. A check that catches nothing the others miss gets cut.
