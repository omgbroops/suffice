# Native Codex v9: integration attempt, 2026-10-23

The live comparison could not run. Native `codex-cli 0.144.1` rejected the first request for `gpt-6.1-sol` with this ChatGPT account. No complete usage receipt arrived. Its cost remains unknown with a known floor of $0; that is not a claim that the call was free. The other seven scheduled attempts did not start. No substitute model or paid retry was used.

The approved campaign allowance was $10 in API-equivalent estimates, with $1 per attempt and 300 seconds per attempt. Two authored JavaScript development tasks were paired across Luna, Sol, the minimal ladder and v9. The first scheduled arm was Sol on JSON-lines parsing. There are zero graded attempts and no acceptance-rate or comparative-cost result. Private evaluators were never introduced.

A metadata-only catalog inspection afterward listed `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-reserve` and `codex-auto-review`; neither requested model was listed. Desktop model labels do not establish native CLI access. A separate supported-model experiment requires an explicit choice and its own frozen protocol, prices and receipts.

## Preserved evidence

- [Frozen public plan](v9-codex-pilot-20261023/plan.json) and [terminal execution record](v9-codex-pilot-20261023/execution-complete.json)
- [Raw CLI events](v9-codex-pilot-20261023/events.jsonl), [stderr](v9-codex-pilot-20261023/stderr.txt), [stage receipt](v9-codex-pilot-20261023/receipt.json) and [public prompt](v9-codex-pilot-20261023/prompt.txt)
- [Unscored summary](v9-codex-pilot-20261023/summary.json)
- [Exact runtime archive](v9-codex-pilot-20261023/runtime.zip) and [file hashes](v9-codex-pilot-20261023/runtime-files.json), verified against the plan's frozen runtime hash

The runtime was hardened further after this rejected attempt. The archive preserves the actual attempted version; no later implementation is represented as having completed live execution. The initial parser counted the metadata error item as non-text activity; raw receipts retain that historical classification, and the current parser treats it as an error.

## Offline verification of the final implementation

`npm run test:v9`: **28 passed, zero failed**. These tests cover controller repair/arbitration, consistent checkpoint scoring and rollback, ignored artifacts, preservation of tests and runner settings, legitimate package export changes, unknown cost, response overshoot, native receipts, process timeout, benchmark isolation, deferred grading, schedule integrity and setup failures.

The full suite has **273 tests: 217 passed, 49 failed, 7 skipped**. An exported untouched `28b40b6` baseline, using the same Node and dependencies on this Windows host, has **245 tests: 189 passed, 49 failed, 7 skipped**. The failing test names match exactly. Existing failures include unavailable `/bin/sh`, Windows symlink permissions and a hard-coded `C:/Users/abhayg/suffice-v4` fixture path. Older runtimes and tests were left unchanged.

Read the [v9 design and limitations](../docs/V9.md) and [benchmark protocol](../docs/V9-BENCHMARK.md). General efficacy remains unmeasured, and reviewers use a zero-tool audit rather than proven tool-schema removal.
