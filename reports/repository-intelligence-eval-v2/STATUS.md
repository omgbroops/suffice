# Evaluation status at cloud handoff

**No final harder-task study has run.** Read
[`docs/CLOUD-HANDOFF-REPOSITORY-INTELLIGENCE-V2.md`](../../docs/CLOUD-HANDOFF-REPOSITORY-INTELLIGENCE-V2.md).

* `luna-xhigh-v2`: 144 primary attempts + 6 diagnostics + 3 pilot attempts.
  Preliminary only: saturated tasks and inherited parent Git metadata.
* Verified patches: baseline 48/48, guided 46/48, on-demand 47/48.
  Baseline normal completion was 47/48; its timeout patch still passed tests.
* `luna-xhigh-isolated-v2/pilot`: corrected Git isolation, 2/3 accepted.
  No main attempts. The user requested harder tasks before any replay started.
* Fixed model/effort: `gpt-6-luna`, `xhigh`. Fast requested in probe, default
  returned; scored runs used default. No stronger benchmark helper was used.
* All raw records are preserved. Do not pool preliminary and future clean data.

The next action is representative hard-task selection/calibration, not replaying
the old easy suite or adding more graph features.
