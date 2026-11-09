# Local resumption and harder pilot

The user cancelled cloud migration on 2026-11-09. Continue on the existing
`codex/repository-intelligence-eval-v2` branch. The cloud handoff remains historical
context; credentials remain untouched in the local Suffice home.

Use **gpt-6-luna / xhigh / default**. The priority probe returned default. Preserve
the existing $12 experiment ledger, including unknown reservations and the earlier
quarantined study. Do not launch the old easy 24-task suite again.

## Resource policy

Initial check: 27.21 GiB disk free, 4.77 GiB of 13.90 GiB physical RAM available.
No WSL distribution or Docker daemon was started. Native Node test dependencies
are shared by directory junction, rather than copied into each agent workspace.
Only runtime/Mocha dependencies are installed, with scripts disabled and a pinned
transitive lock. Browser, release and build dependencies are omitted.

The user permits greater concurrency when resources permit and CPU stays below
about 85°C. CAM is installed and running. WMI thermal/OpenHardwareMonitor/
LibreHardwareMonitor interfaces returned no usable sensor. NZXT's documented API
is a callback inside Kraken web integrations, not a standalone REST endpoint:
https://developer.nzxt.com/ . No CAM-owned listening TCP port was found. Reading
the installed application showed a native CoreClient interface; it was not loaded
or used to alter hardware. No display or cooling settings were changed.

CAM UI observations before inference: 66°C/14% CPU load, then 69°C/21% after setup.
These are point-in-time observations, **not continuous thermal enforcement**.
Keep the pilot serial while no reliable automated sensor is available. The runner
requires at least 2 GiB free RAM and 6 GiB free disk before dispatch and samples
memory/disk every 10 seconds. Only one test/build process runs at a time. Do not
claim a guaranteed 85°C ceiling from spot checks. Do not start heavy containers
or high-concurrency campaigns without revisiting memory, disk and temperatures.

## Prospective pilot selection

Source: SWE-bench Multilingual, dataset revision
`846e647b9f33c0b51b739d005d13d85493c9af09`, original Parquet SHA256
`92abca7cb527b41a9f66d03a26ce441ff7319e3a49f985998fd56be4bb9b08b2`.
The extracted upstream row is in `benchmarks/intelligence-hard-pilot/axios-5316.json`.
Selection preceded all Luna outcomes: Axios native Node FormData support has the
largest Axios production patch in this corpus (eight production/config files,
356 diff lines). This is deliberate calibration selection, not random sampling,
and patch size alone does not establish difficulty. Do not include this issue in
the later held-out set or describe this adaptation as an official SWE-bench score.

The issue is presented verbatim with generic repository/verification instructions.
Gold patch, new test patch, expected labels and dataset metadata stay outside the
agent workspace. Existing upstream tests remain visible. Native host processes
are not OS-sandboxed; scope restrictions alone do not establish secrecy or prevent
external access. Raw trajectories must be audited for evaluation-material reads.

Preparation uses the actual upstream base commit and actual upstream test patch.
Official FormData F2P/P2P cases are checked by exact Mocha full titles. Empty code
must fail the named F2P, reference code must pass all three targeted cases, and both
must pass 39 existing core/helper/utils regression cases before dispatch. Grading
reconstructs a fresh repository from pristine input plus allowed production edits,
reapplies upstream tests, and checks dependency content before executing. All agent
and grading directories have their own Git root. Patch application explicitly
rejects an inherited Git root. Test reports fail closed on missing/skipped cases or
inconsistent counters. New production helpers are allowed; tests/configs are frozen.

This is a Windows/Node 24 adaptation with a smaller pinned dependency environment,
not the official Linux image. Browser/build/type suites and the rest of the HTTP
adapter suite are not scored. Keep these coverage limitations alongside results.

## Run plan and bounds

Prepare: `node scripts/prepare-intelligence-hard-pilot.mjs`.
Pilot baseline: `node scripts/intelligence-hard-pilot.mjs --arm=A`.
Optional matching pilot diagnostics use B guided / C on-demand, separately labeled.
Each dispatch reserves $0.75 in the shared experiment ledger; unknown usage keeps
the reservation. No stronger model or external grader model is used. Each attempt
gets the same 1,200 seconds, 90 turns, 400 tool calls and 16,384 output tokens per
request. This longer horizon is prospectively chosen for the real multipart repair,
not tuned against held-out outcomes. Freeze exact source bytes and input hashes.

The initial pilot is only one issue and cannot estimate general efficacy. It must
not become an excuse to cherry-pick a final suite. Expand calibration to disjoint
real issue families, validate infrastructure, then freeze a fresh prospectively
categorized holdout. Run matched A/B/C with two repetitions where the remaining
budget/resources permit; report balanced subset coverage if the full plan cannot
fit. Report information accuracy separately from independently accepted engineering
patches, normal agent finish, regressions, time, tokens, cost and graph overhead.
