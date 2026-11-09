# Real-issue evaluation protocol

The prospective cohort contains 24 Svelte issues: eight local production fixes,
eight changes in two or three production files, and eight audited changes across
compiler/runtime stages. These are locality and change-breadth categories, not a
validated hardness scale. The selected model is **gpt-6-luna, xhigh, default tier**.
It solved the disjoint Axios pilot and failed the disjoint transition pilot's
hidden runtime checks, establishing capability without a ceiling on that pilot.
No global model ranking is claimed. Calibration inputs never enter this cohort.

`benchmarks/intelligence-real-v3/cohort.json` and the 24 records were committed
before main inference. `scripts/select-intelligence-real-v3.py` reproduces their
selection from the SHA-pinned SWE-PolyBench CSV. Original issue statements remain
the agent inputs. Ambiguous API proposals and a description that only linked an
unspecified transition bug were rejected before main outcomes. Public historical
issues may be training-contaminated, and issue clusters share code; a broader
independent repository sample is required for generalization.

## Conditions and budgets

- A: existing agent behavior, graph off.
- B: existing always-guided graph context.
- C: rule-based graph-on-demand, with explicit trigger logs.

All conditions receive identical task bytes, baseline tree, native environment,
model settings and budgets. Each task/condition has two independent fresh sessions.
The 144 planned cells are seeded and randomized into nine-cell waves containing
one task per category and all three modes. Both repetitions use fresh workspaces
with their own Git root and fixed initial commit metadata.

Each attempt gets 1,200 seconds, $0.50 API-equivalent allowance, 90 model turns,
400 tool calls, 16,384 output tokens, zero SDK retries, a $0.25 request reserve,
and a 1 MiB provider payload cap. No stronger model verifies, routes or repairs
implementations. A subscription profile is required; no paid-key fallback occurs.
The existing $12 experiment-wide ledger retains all earlier known and unknown
usage. A whole category-balanced wave is reserved before dispatch. If the cap
prevents another wave, report the balanced subset and every missing cell.

At most one fresh replacement per cell is allowed after explicit provider unavailability
or a no-model resource preflight. Temporary provider failures impose a 15-minute
cooldown; a second interruption stops dispatch. Coding failures, failed tests and
spent model budgets never trigger replacements. Original attempts and their costs
remain recorded. Authentication and other provider failures stop the campaign.

## Resources and reproducibility

An exclusive local lease and the ledger serialize all inference and preparation.
There is no reliable automatic temperature telemetry, so concurrency stays at one.
The coordinator waits for 2 GiB available RAM; each worker requires 1.75 GiB and
6 GiB free disk. Project build/test processes use pinned Node 16.20.2 with a
384 MiB heap. Preparation can run in separate 256 MiB parent processes per task
to reclaim compiler/test metadata between cases. Build and test commands remain
sequential. Ten-second samples record worker RSS and whole-machine free RAM;
they miss short peaks and do not measure child-process RSS or CPU temperature.

The common source archive binds implementation, configuration and analysis code.
Workers verify source bytes, Node version, public model metadata, baseline file
hashes, validation receipts, dependency locks and dependency contents. Drift stops
dispatch. Exact source/production archives and raw events/sessions remain available;
owned workspace and grading copies may be removed after their production archive
is saved. Main inputs and receipts bypass Git newline conversion.

Preparation is staged by the already-seeded balanced waves. The first two waves
cover the same three tasks twice: local 1048, cross-file 1516 and complex 835.
The common implementation, all 24 task records, settings and order freeze before
the first model request. Each task's validation manifest freezes separately before
that task's first request. Later unprepared tasks stop dispatch with
`additional_preparation_required`; they are neither skipped nor counted as coding
failures. Preparing the next wave and resuming uses the same frozen implementation
and preserves completed cells. This change was made before main inference to get
the first balanced comparison running without waiting for all 24 environments.

## Native test adaptation

Only audited classic build commands are expanded from the original package
scripts: Node scripts, Rollup configurations and recursive `npm run` aliases.
Execution bypasses a shell. Upstream top-level dependency versions use exact or compatible Yarn-locked versions.
If a declared semver range has no compatible locked entry, npm resolves it once
and the full installed lock and content hashes freeze that choice. Each decision
is recorded; non-semver fallback sources are rejected.
Nightmare/Electron and development-only lint/coverage tools are not provisioned.

The loader preserves original source-unit and test-suite discovery. Windows glob
normalization and Git Bash preserve the existing CLI fixture commands/assertions;
only generated banner path separators are normalized. The native adaptation omits
the Nightmare suite and, when no official label requires it, the known incompatible
runtime `binding-select` sample. That old jsdom/Node assertion can exhaust the heap
even in isolation; the raw diagnostics are retained. Its SSR counterpart still
runs. Omitted cases are never called passes or pending. Every official target and
regression title must remain discovered. Any remaining original unscored failures
and existing pending tests are recorded separately.

Legacy console methods are rebound for Node's detached warning callbacks. A
targeted SourceMap write shim restores the old string-coercion convention in CLI
children; source-map path fields are normalized while mappings and source content
remain unchanged. Original assertions still run. These setup repairs are applied
before main inference and revalidated across all modes.

Adapter 4 also routes the newer ShellJS fixtures through the same pinned runtime.
Their upstream `commandErr` destructuring did not inspect ShellJS's `code`, and
`actual.forEach` could silently accept absent generated files. The adapter checks
the child exit code and the complete expected output inventory before the original
content assertions. Setup diagnostics retain the earlier host-Node failures.
The cohort uses a ten-second default Mocha test timeout instead of two seconds,
after original parser tests exceeded two seconds during setup. Explicit per-test
timeouts and assertions remain intact; the suite process still has its 120-second
limit. Both original-code and upstream-fix gates are refreshed before inference.

Every task must pass an original-code gate (all target labels fail, all required
regressions pass) and an upstream-fix gate (all target and regression labels pass).
Frozen full-title multiplicities prevent dropped duplicate cases. A failed gate
is an infrastructure/evaluator outcome for that fixed task; it is not silently
replaced based on model results. The agent never sees the held-out test patch.
After it stops, grading rebuilds pristine source, copies only production edits,
reapplies upstream tests and executes independent verification. Native command
scope remains a contract rather than an OS sandbox.

## Analysis

The primary outcome is independent patch acceptance plus required regressions
and valid scope/configuration. A budget-stopped patch can still meet those checks.
Normal completion and accepted partial patches are reported separately. Provider and evaluator failures are distinct from
engineering failures; missing cells remain visible. All official targets count
in strict acceptance; runtime-target counts separately describe snapshot-sensitive
cases. Passing static dependencies does not prove behavioral correctness.

The report preserves per-task/repetition outcomes, token usage, actual usage
receipts, known cost and unknown reservations, agent/worker time, tool calls,
graph queries, trigger reasons, refresh/scan latency and sampled resources.
Cost per accepted attempt is unknown when a contributing cost is unknown.
Paired success differences require both repetitions for each included task.
The deterministic 2,000-draw bootstrap resamples tasks, not individual repeated
runs; intervals are omitted below five complete tasks. These conditional intervals
do not establish population equivalence, including when all observed pairs tie.

Reference-path deviations cannot establish missed dependencies or unnecessary
edits. Temporal overlap between guidance and later path use cannot establish
causal influence. The three conditions do not isolate initial context, dependency
discovery, test selection and retry mechanisms separately. Those remain proposed
ablations if the primary comparison supplies a credible benefit to explain.

## Commands

Prepare with `node --max-old-space-size=256 scripts/prepare-intelligence-real-v3.mjs`.
For scarce RAM, run it once per `--task=ID`; validated matching receipts are reused.
`--retry-infrastructure` retains old diagnostics and reattempts setup only.
Run all root tests serially, then inspect
`node scripts/intelligence-real-v3.mjs --dry-run` before inference.
`node --max-old-space-size=256 scripts/intelligence-real-v3.mjs` runs the frozen schedule serially.
An audited provider recovery can resume with `--resume-provider`.
`node --max-old-space-size=384 scripts/report-intelligence-real-v3.mjs` regenerates
the machine-readable results and Markdown report without making model requests.
