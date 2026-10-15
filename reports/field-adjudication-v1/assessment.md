# Independent v1 adjudication assessment

Updated 2026-10-15T07:42:28.821374+00:00. Model calls: **0**. Model replay cost: **$0**. All14 original v1 result and patch hashes still match. Frozen general input mismatches: 0.

All six integration patches pass independent diagnostics but v1 remains invalid for harness/cost comparison. State four and q01 two independently pass. q02-stock-pi is a genuine native event-contract regression despite private success. q02-suffice retains its original accepted score; a full replay timing failure is disclosed, with unchanged baseline reproducing that timing failure in matched focused runs. No original result is overwritten and no rerun-until-pass replaces full replay evidence.

| Attempts | Independent evidence | Interpretation |
|---|---|---|
| i01/i02/i04, both arms | Restored native and private checks pass; native totals378/384/187 | Diagnostic only; original actor/evaluator dependency errors invalidate v1 harness/cost comparison |
| s02/s03, both arms | Native50/53 and private1/3 pass | Independently validated within documented environment limits |
| q01, both arms | Native199, build/types and private checks pass | Independently validated within documented environment limits |
| q02-stock-pi | Native193:192pass,1fail; private/build/types pass | Genuine premature public next-event emission |
| q02-suffice | Original native/private pass; replay193:192pass,1timing fail; private/build/types pass | Preserve full replay failure and original accepted result; source regression not established |

The q02 stock-pi source emits `next` synchronously on start. The original native assertion requires no such event before completion. The actor retrieved that test and replaced its event expectations; both v1 and replay restore original expectations. This is observable contract reinterpretation, not inferred internal understanding.

For q02-Suffice, five fixed matched baseline/submitted repetitions of each of two original timing tests were run. The unchanged baseline failed `strict mode multiple complete intervals`1/5; submitted code passed5/5. `strict mode rapid sequential adds`passed5/5 on both. The full replay timing failure remains preserved. Its patch observes existing active/next events and does not change strict scheduling logic.

Native count caveat: Nano Stores fake-timer files can appear as aggregate passing test files. Totals are exact runner output and match original controls. No claim of complete lint/type/size CI is made. Optional tooling limitations are recorded separately from dependency-layout invalidity.

Raw command results and frozen input expectations: `summary.json` and `.suffice/field-adjudication-v1/attempts/*/adjudication.json`. Source/trace diagnosis: `failure-evidence.json`. Fixed timing repetitions: `timing-diagnostic.json`. Actor environment evidence: `environment-evidence.json`. All originals and parser-history receipts are retained.
