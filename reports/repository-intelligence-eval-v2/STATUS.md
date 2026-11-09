# Local evaluation status

The user cancelled the cloud handoff. Continue locally with **gpt-6-luna / xhigh / default**, one concurrent attempt whenever temperatures cannot be read. Current runners remain serial. The harder study is running in serial balanced blocks; [real-v3/REPORT.md](real-v3/REPORT.md) records actual outcomes and missing cells.

- Earlier `luna-xhigh-v2`: 144 primary attempts, six diagnostics and three pilot attempts. Quarantined because tasks saturated and workspaces inherited parent Git metadata. Baseline patches 48/48, guided 46/48, on-demand 47/48; baseline normal completion 47/48. Do not pool these with new trials.
- Corrected-isolation synthetic pilot: 2/3 accepted; no main replay.
- Disjoint real Axios pilot: all three modes accepted; one run per mode.
- Disjoint Svelte class-scoping pilot: target criteria 44/48 baseline, 36/48 guided, 44/48 on-demand. All retained 1,607 required regressions. The baseline's four misses are formatting-sensitive snapshots, not independently demonstrated runtime bugs. On-demand hit its allowance; total cost remains unknown and reserved.
- Separate compiler-oracle information measurement now exists. Read [INFORMATION-CALIBRATION.md](INFORMATION-CALIBRATION.md); use the corrected `native-information-v4.json`, not earlier oracle diagnostics. These retrieval scores do not establish agent improvement.
- Bounded graph output, ignored-untracked artifact filtering, configured TypeScript module resolution and provider preflight accounting are implemented and tested. They were added after the two scored pilots; those pilots' source manifests remain authoritative.
- Transition calibration 1428 completed: baseline and guided each passed 0/6 hidden runtime targets and all 1,863 required regressions. On-demand passed 3/6 in its partial patch, then a provider 503 interrupted the account. It is not a completed coding comparison; unknown usage remains reserved.
- A new 24-task cohort (8 local, 8 cross-file, 8 broader changes) is frozen in `benchmarks/intelligence-real-v3/cohort.json`. Validated balanced blocks run before preparing subsequent blocks. The same frozen implementation is used throughout; unprepared cells remain explicit.
- Root tests passed 136/136 serially after the native CLI safeguards; the captured output is `tests-real-v4-final.txt`. Native gates use adapter 4, including a ten-second default native test timer and complete CLI output inventories.
- The final variable-kind adapter recheck is complete. In the same 23-definition sample, graph retrieval found 25/25 Axios and 30/30 Svelte binding lines with no observed false positives. These are limited source-line diagnostics, not program completeness or engineering success. Both oracle/adapter corrections and earlier raw records are preserved.

[LOCAL-PILOTS.md](LOCAL-PILOTS.md) reports all nine calibration trajectories, observed cost/time and qualifications, including the interrupted attempt. Old cloud instructions are historical context only. A behavior-focused prospective holdout and repetitions are still required before an efficacy conclusion.
