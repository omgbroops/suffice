# Local evaluation status

The user cancelled the cloud handoff. Continue locally with **gpt-6-luna / xhigh / default**, one concurrent attempt whenever temperatures cannot be read. Current runners remain serial. No final harder-task study has run.

- Earlier `luna-xhigh-v2`: 144 primary attempts, six diagnostics and three pilot attempts. Quarantined because tasks saturated and workspaces inherited parent Git metadata. Baseline patches 48/48, guided 46/48, on-demand 47/48; baseline normal completion 47/48. Do not pool these with new trials.
- Corrected-isolation synthetic pilot: 2/3 accepted; no main replay.
- Disjoint real Axios pilot: all three modes accepted; one run per mode.
- Disjoint Svelte class-scoping pilot: target criteria 44/48 baseline, 36/48 guided, 44/48 on-demand. All retained 1,607 required regressions. The baseline's four misses are formatting-sensitive snapshots, not independently demonstrated runtime bugs. On-demand hit its allowance; total cost remains unknown and reserved.
- Separate compiler-oracle information measurement now exists. Read [INFORMATION-CALIBRATION.md](INFORMATION-CALIBRATION.md); use the corrected `native-information-v3b.json`, not earlier oracle diagnostics. These retrieval scores do not establish agent improvement.
- Bounded graph output, ignored-untracked artifact filtering, configured TypeScript module resolution and provider preflight accounting are implemented and tested. They were added after the two scored pilots; those pilots' source manifests remain authoritative.
- Transition calibration 1428 completed: baseline and guided each passed 0/6 hidden runtime targets and all 1,863 required regressions. On-demand passed 3/6 in its partial patch, then a provider 503 interrupted the account. It is not a completed coding comparison; unknown usage remains reserved.
- A new 24-task cohort (8 local, 8 cross-file, 8 broader changes) is frozen in `benchmarks/intelligence-real-v3/cohort.json`. Native gates are being prepared in isolated serial processes, with RAM waits. No main model requests have run.
- Root tests passed 132/132 serially; additional focused provider/budget checks passed.
- Information scoring needs one final adapter recheck before precision claims: map variable declarations to the engine's binding/function kinds. The old adapter failed to query three negative variable definitions. Its source and v3b result are retained; defer the rerun until preparation is idle to avoid overlapping heavy work.

[LOCAL-PILOTS.md](LOCAL-PILOTS.md) reports the completed six trajectories, observed cost/time and qualifications. Old cloud instructions are historical context only. A behavior-focused prospective holdout and repetitions are still required before an efficacy conclusion.
