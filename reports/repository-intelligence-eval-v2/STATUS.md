# Local evaluation status

The user cancelled the cloud handoff. Continue locally with **gpt-6-luna / xhigh / default**, one concurrent attempt whenever temperatures cannot be read. Current runners remain serial. No final harder-task study has run.

- Earlier `luna-xhigh-v2`: 144 primary attempts, six diagnostics and three pilot attempts. Quarantined because tasks saturated and workspaces inherited parent Git metadata. Baseline patches 48/48, guided 46/48, on-demand 47/48; baseline normal completion 47/48. Do not pool these with new trials.
- Corrected-isolation synthetic pilot: 2/3 accepted; no main replay.
- Disjoint real Axios pilot: all three modes accepted; one run per mode.
- Disjoint Svelte class-scoping pilot: target criteria 44/48 baseline, 36/48 guided, 44/48 on-demand. All retained 1,607 required regressions. The baseline's four misses are formatting-sensitive snapshots, not independently demonstrated runtime bugs. On-demand hit its allowance; total cost remains unknown and reserved.
- Separate compiler-oracle information measurement now exists. Read [INFORMATION-CALIBRATION.md](INFORMATION-CALIBRATION.md); use the corrected `native-information-v3b.json`, not earlier oracle diagnostics. These retrieval scores do not establish agent improvement.
- Bounded graph output, ignored-untracked artifact filtering, configured TypeScript module resolution and provider preflight accounting are implemented and tested. They were added after the two scored pilots; those pilots' source manifests remain authoritative.
- Next disjoint calibration: Svelte 1428 transition cancellation, six runtime target criteria. Validate empty/reference gates before any model dispatch. Windows test discovery and POSIX CLI fixture adapters are being calibrated. Preserve failed setup observations; they are infrastructure diagnostics, not model outcomes.

[LOCAL-PILOTS.md](LOCAL-PILOTS.md) reports the completed six trajectories, observed cost/time and qualifications. Old cloud instructions are historical context only. A behavior-focused prospective holdout and repetitions are still required before an efficacy conclusion.
