# V10 versus native Codex: 15-task comparison

The frozen comparison is running: **15 historical tasks × two arms = 30 attempts**. Independent grading has not run and no acceptance result is implied yet.

V10 uses the existing Pi/Luna/Sol controller; native Codex uses the desktop-bundled CLI with `gpt-6.1-sol` at high effort. Tasks span node-semver, picomatch, bytes, cookie, path-to-regexp and js-yaml. They were not in the previous four-task pilot, but are known historical development replays. Each arm receives the same public source and regression checks in a fresh temporary Git root.

The native model connectivity probe and final file-write/shell canary passed. Earlier setup canaries are retained, including the disabled Code Mode host and Windows workspace-write refusals; they are not scored benchmark attempts. Both benchmark arms use full host access. No hidden verdict or private evaluator path is passed to either actor. The 600-second deadline is matched; model routing and internal operational limits differ. Costs use common pinned base-rate estimates, with raw receipts and uncertainty retained.

**52 targeted tests passed**: the 31 existing v10 tests, 15 native-adapter tests and six paired-runner tests. Public fixture preparation passed all 15 suites (70 tests). A separate read-only protocol review caught evaluator-freeze anchoring and unverified-grading issues, which were fixed before execution.

See the [protocol](../docs/V10-NATIVE-BENCHMARK.md), [plan](v10-native15-20261023/plan.json), [preparation](v10-native15-20261023/preparation.json), [pricing](v10-native15-20261023/pricing.json), [grader freeze](v10-native15-20261023/grading-freeze.json), [frozen runtime](v10-native15-20261023/runtime.zip) and [original inputs](v10-native15-20261023/public-inputs.zip). Final results will preserve both failed attempts and ungraded cases.
