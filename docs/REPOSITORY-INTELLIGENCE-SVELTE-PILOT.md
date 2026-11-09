# Compiler calibration pilot

This is a second disjoint real-issue pilot, not held-out confirmation. The first
Axios pilot accepted all three modes; that single issue does not calibrate a
general hard study. Do not pool these pilots into the earlier quarantined suite.

Source: `AmazonScience/SWE-PolyBench_Verified`, revision
`b3fca77b637379f0c01ad86d18753a7ac1998b53`, instance `sveltejs__svelte-1190`.
Exact source row, CSV/archive hashes, upstream production patch and test patch are
in `benchmarks/intelligence-svelte-pilot/svelte-1190.json`. Selection preceded Luna
outcomes: it changes CSS scoping across six compiler production files and has 48
F2P and 1,607 P2P labels. Source patch size is descriptive, not a difficulty proof.

## Environment and verification

Use the original source revision with a pinned minimal dependency subset, and a
portable Node 16.20.2 Windows executable verified against official SHASUMS256.
The agent CLI still runs on Node 24. No system runtime, browser or Docker install
is required. Dependency install scripts are disabled. Build/test processes have
a 384 MiB V8 heap cap and run serially. Tests and compiler behavior are unchanged;
an external loader omits the Nightmare/Electron custom-elements suite, which has
zero scored F2P/P2P labels. This adaptation is not an official SWE-PolyBench score.

The original native suite discovers 1,722 cases: 1,666 passes, three legacy
`runtime binding-select` failures and 53 pending cases. The three failures are
absent from the dataset's scored labels. They remain failures in every report;
they are never relabeled as passes. Known pending cases remain pending. Any new
failure or pending title rejects a patch. All scored criteria must explicitly
pass. Eleven SSR cases have duplicate full titles: freeze all title multiplicities
and require every matching case to pass. Missing cases, inconsistent counters,
dropped duplicates and inconsistent exit status fail closed.

Preparation gates after applying the actual upstream test patch:

| Input | F2P passed | P2P passed | Existing failures/pending |
|---|---:|---:|---|
| Empty production patch | 0/48 | 1,607/1,607 | 3 / 53 |
| Upstream reference | 48/48 | 1,607/1,607 | 3 / 53 |

Agent workspaces include original visible tests, source and verification helpers.
Gold code, new test expectations and labels remain outside. The task explicitly
notes that old snapshots encode the old attribute markup; independent grading
restores the upstream new expectations. Existing test/config/helper files are
immutable; new production files and scratch test outputs are allowed. Build
outputs are allowed but never trusted by the grader. Grading reconstructs a fresh
Git repository, overlays only permitted production edits, rebuilds from source,
and executes the upstream tests with a separate structured reporter. Shared
dependency files are content-checked. This is scope control, not OS sandboxing.

## Run protocol

`node scripts/prepare-intelligence-svelte-pilot.mjs` validates/rebuilds the inputs.
`node scripts/intelligence-svelte-pilot.mjs --arm=A` runs baseline. B is guided,
C is on-demand. Keep **one concurrent agent attempt**; when temperatures cannot
be read, the user's explicit maximum remains one. CAM UI spot checks have shown
66–69°C, not a continuously enforced ceiling. Require 1.75 GiB free RAM and 6 GiB
free disk before dispatch, record resource samples, and avoid concurrent setup
work during these scored pilot trajectories.

All modes use gpt-6-luna/xhigh/default, identical task trees and prompts, 1,200
seconds, 90 turns, 400 tools, 16,384 output tokens/request, a $0.75 run reservation,
no retries and no helper/grader model. Preserve the global $12 ledger. Freeze
implementation bytes and starting Git roots/trees. Budgets are calibrated only
on pilots; do not use held-out outcomes to tune tasks, controller or allowances.

Existing TypeScript extensionless imports and custom verification wrappers are
coverage limitations of the current engine/controller. The on-demand failure
heuristic does not recognize `node native-verify.cjs`; export edits, coordinated
edits and explicit requests remain triggers. Do not silently change the controller
to favor this pilot. Measure actual graph coverage and keep search as fallback.

Even passing every scored case does not prove full compiler correctness. Snapshot
tests constrain emitted formatting. Public tasks may have training contamination.
One issue per family and one attempt per mode are calibration data, not an efficacy
estimate. A fresh multi-task holdout with matched repetitions is still required.
