# Repository intelligence v4 research protocol

This branch studies the existing architecture. The graph parser, resolver,
index, guidance policy and on-demand triggers are unchanged from v3. Evaluation
instrumentation is separate from feature development. No result from v3 is a
v4 observation, and no stronger model judges patches or repairs Luna attempts.

## Audit of the starting state

The supplied 18-attempt result was an intermediate checkpoint. The background
continuation subsequently completed 36 attempts on six Svelte tasks. Its final
acceptance is baseline 8/12, always-guided 9/12 and on-demand 9/12. Estimated costs
are $0.30082896, $0.35588320 and $0.34577916. All 36 have complete usage receipts
and verified configuration. They remain in `reports/repository-intelligence-eval-v2/real-v3`.

The earlier checkpoint had 126 undispatched cells. At closure, 108 remained.
They were not 108 observed engineering failures. The next environment, Svelte
599, failed four original window-event/resize tests under the native adaptation;
the supervisor stopped before dispatching that block. Its final diagnostics
were committed on v3 before creating this branch at `0fcde01`.

Earlier preparation also encountered stale dependency selectors, host Node
instead of pinned Node in CLI fixtures, missing-output assertions that could
pass vacuously, console callback incompatibility, and two-second test timeouts.
Those diagnostics and the fixes preceding the 36 main runs remain preserved.
Provider-503 calibration interruptions were earlier, separate pilots; none of
the 36 main observations is a provider failure. Unknown historical usage remains
reserved in the existing ledger and is never converted to zero.

V3 relied on a workspace contract for shell access. V4 uses the installed Codex
native Windows MXC command sandbox through Pi's existing `BashOperations` seam.
Optional CLI plumbing injects that executor and meters a common task token ceiling; normal CLI defaults and
all intelligence implementations remain unchanged. The agent filesystem tools
retain their existing workspace path guards.

## Four conditions

| Condition | Model | Effort | Intelligence |
|---|---|---|---|
| A | gpt-6-luna | xhigh | off |
| B | gpt-6-luna | xhigh | always-guided |
| C | gpt-6-luna | xhigh | existing on-demand controller |
| D | gpt-6.1-sol | medium | off |

All use default tier; the live preflight verifies the exact model, effort and
tier in provider receipts. No fallback model is permitted. Both catalog entries
advertise a 272,000-token context and 128,000 maximum output tokens. Experiment
limits will be lower and identical across conditions. Unspecified decoding
controls remain provider defaults, rather than invented cross-model settings.

The local catalog estimates input/output/cached-input prices per million tokens
as $0.10/$0.50/$0.01 for Luna and $2/$10/$0.10 for Sol. These are recorded catalog
estimates, not invoices or externally verified account billing. Long-context
tiers are retained in machine-readable metadata. The user explicitly selected
Sol Medium before primary inference. This compares model/effort configurations,
not an isolated foundation-model effect at equal effort. Effort labels do not
establish identical internal computation across models.

## Preflight and isolation

`node scripts/preflight-intelligence-v4.mjs --models` executes four disjoint
infrastructure smoke attempts, one per condition. It verifies real credentials,
actual agent edits, clean independent Git roots, held-out acceptance tests,
public regressions, graph refresh after an edit, cache reuse and complete usage
receipts. These toy tasks are excluded from every engineering success table.

The successful first smoke batch is
`reports/repository-intelligence-v4/preflight/2026-11-09T21-00-04-714Z`.
All four initially passed with exact xhigh/default receipts; total estimated
model usage was $0.03066122. Its Sol-xhigh smoke is historical preflight only.
The separate Sol Medium smoke at `2026-11-09T21-26-51-922Z` also passed: four requests with exact Medium/default receipts, estimated $0.01585920. Total v4 preflight cost is $0.04652042. Failed boundary-
launch diagnostics before that batch made no model requests and remain preserved.

The boundary denies the host user's home directory, including the evaluator,
sealed records, prior reports, Git objects and credentials. Each attempt has
its own workspace under `C:/Users/Public/SufficeV4`; other attempt directories
are denied. Only the current workspace is writable. Selected dependency and
runtime directories are separately readable. Hidden test patches and correct
patches never enter agent workspaces, tool outputs or Git history. Independent
grading starts after the agent stops and reconstructs production edits in a
pristine copy before adding held-out tests.

Preflight proved denied absolute reads, denied junction traversal, inherited
child-process restrictions, allowed workspace writes, and blocked external
networking. Native MXC was available on this host. Docker and WSL stayed stopped.
Git Bash's MSYS object namespace failed inside MXC, so the evaluation's existing
`bash` tool delegates to PowerShell 7 with no profile. Every model receives the
same explicit shell instructions. This is a documented platform difference from
v3. There is no silent unsandboxed fallback.

The sandbox interface is documented at
[Windows MXC compatibility](https://learn.chatgpt.com/docs/windows/windows-sandbox#mxc-compatibility)
and [filesystem permission rules](https://learn.chatgpt.com/docs/permissions).
The preflight records actual behavior, not just configured permissions. Host
loopback and other platform limitations must not be mistaken for a universal
host-security proof. No secret-bearing evaluator server runs on loopback.

## Primary cohort

`benchmarks/intelligence-v4/cohort.json` freezes 24 tasks before primary inference:
four simple, twelve cross-file and eight complex. It contains nine Prettier,
ten Serverless and five Three.js issues, all disjoint from the Svelte v3 cohort.
The SHA-pinned SWE-PolyBench CSV and its revision are recorded in the manifest.
`python scripts/select-intelligence-v4.py` reproduces hash ordering within fixed
repository/category quotas and the documented pre-inference exclusions.

Correct patches and held-out test patches remain in ignored, host-only records
under `.suffice/intelligence-v4/records`. Public manifests contain hashes and
provenance, not solutions. Do not copy those records into the agent filesystem.
Reconstruction requires the matching pinned dataset bytes on the evaluator host.

Every case must retain all dataset target and regression labels and pass both
original-code and reference-fix gates before its first model attempt. Setup
failure never causes a task to be silently replaced after primary inference.
Categories reflect audited change breadth, not a validated difficulty scale.
Historical public issues may be training-contaminated. Shared repository code
and related features create correlations; 24 tasks are not 24 independent
repository families. Native verification is not an official SWE-PolyBench score.

## Execution and analysis commitments

The target is 192 attempts: every task, all four conditions, two fresh
repetitions. Execution remains strictly serial whenever temperature telemetry
is unavailable. No 85-degree enforcement is claimed. The order is balanced
across four conditions; a budget stop must retain balanced condition counts and
explicit missing cells. Actual per-attempt limits and the spending cap must be
frozen in `protocol.json` before primary inference. The user authorized a $25 v4
cap, including v4 preflight. Its separate ledger carries forward the $0.03066122
already used by v4 smoke runs. Earlier v3 known/unknown usage is preserved in its
original ledger and is not reset or silently counted as v4 data.

Primary success means held-out acceptance plus required regressions, intact
evaluation scope, verified model configuration and stable source. Normal
completion is separate: a budget-stopped verified patch may still be accepted.
Provider, configuration, evaluator and missing-attempt states are distinct from
coding failures. There are no outcome-based retries or stronger-model repairs.

The four planned comparisons are B-A, C-A, C-B and C-D. Paired estimates require
both repetitions and resample whole tasks, not independent repeated runs.
Family correlations and incomplete cases remain explicit. Similar observed
rates or a degenerate all-tie bootstrap never establish equivalence. Costs with
missing receipts remain unknown; cost per accepted task is unknown when any
contributing cost is unknown. Token use, end-to-end time, tool iterations,
graph refresh/scanning and controller triggers are reported separately.

Every discordant task will have a descriptive mechanism audit in both directions:
the evidence returned, alternative search availability, subsequent reads/edits
and verification, repeatability, and possible cheaper ways to retrieve it.
Temporal path overlap does not establish causal use. Reference patch paths do
not prove necessity, missed dependencies or unnecessary edits. No LLM grades
correctness; only independent tests determine acceptance.

Keep the architecture optional unless this experiment supplies credible accuracy,
dependency-failure or cost-per-accepted-task improvements. Inconclusive results
must lead to a targeted follow-up, not a favorable adoption claim.

## Frozen execution design

The common agent limits are 1,200 seconds, 90 model turns, 400 tool calls,
16,384 output tokens per response, 1 MiB serialized provider payload, and four
million cumulative metered tokens (checked at response boundaries). Provider
retries are disabled. The serial worker has a 768 MiB V8 heap; repository test
children have 384 MiB. Parent/worker free-RAM floors are 2/1.75 GiB and disk
floor is 6 GiB. A 40-minute outer worker timeout allows setup and independent
grading outside the common agent window.

Emergency monetary ceilings are $0.25 for Luna and $5 for Sol, proportional to
the catalog input/output price ratio. They are admission guards, not equal
inference budgets. Every binding dollar, payload, token, time or tool guard
remains visible in the trajectory; cost-censored outcomes must not be presented
as a pure capability comparison. An entire four-arm task/repetition round is
reserved before dispatch. If $25 cannot fund another full reservation, remaining
cells stay missing. The schedule uses Williams-balanced arm positions and
interleaves repository families; each task has two fresh repetitions.

No correctness retry is allowed. Provider, environment or evaluator failures
stop dispatch and preserve partial rounds; any replacement requires an explicit
documented protocol amendment. A balanced subset is the fallback for a budget
stop, not permission to hide infrastructure-induced missingness.

A task whose original/reference gate fails under the frozen adapter retains all
eight cells as environment-affected missing data. Other tasks proceed in their
frozen order; no replacement task is selected. This avoids the v3 failure mode
where one unsupported environment blocked all later tasks. A new adapter or
grading change after primary inference would require a separate cohort/version.

The Pi codemode executor was inspected: it runs model scripts in QuickJS WASM
with only registered tool callbacks, no Node filesystem or network. Native file
tools retain repository real-path guards; arbitrary shell execution uses MXC.
Raw framework reports are copied out of a separate precreated grading sibling,
which actor commands cannot read. Exact Git binary patches are archived before
reclaiming each attempt’s generated workspace.

The Three.js adapter follows the upstream Node-only `!-webonly` filter. Existing
TODO stubs remain recorded, including duplicate titles shared with passing tests;
pending multiplicities are frozen so a newly skipped regression cannot be hidden
under a pre-existing TODO name. Jest runs serially with Watchman disabled because
this host has no Watchman daemon. Framework adapters retain every named dataset
target and regression. These native adaptations limit portability of the scores.

## Validation and execution state

The full root suite passed 145/145 tests in 62.949 seconds. The final offline
preflight (`2026-11-09T22-28-58-258Z`) passed workspace isolation, external-network
denial, graph version change, one-file reparse, stable symbol IDs and zero-file
warm-cache reuse. A separate process-lifetime probe returned in 808 ms and
confirmed its detached child did not survive sandbox return; no delayed read of
a future grading directory occurred. These are measured host observations.

Serverless 5926, Prettier 12584 and Three.js 23796 passed original/reference gates.
Three.js raw reports exposed QUnit duplicate-name trailing-space handling. The
last stabilization changed only the grading module; `regrade-intelligence-v4.mjs`
verified unchanged execution inputs and baseline hashes, then regraded archived
raw reports. Its receipts explicitly state that tests were not rerun. Every
prior failed validation remains preserved. The same strict grading logic is
frozen before primary inference; required tests need an active passing case,
not a TODO result.

The prospective protocol and exact source archive are frozen in
`reports/repository-intelligence-v4/protocol.json` and `frozen-source.tar.gz`.
Primary dispatch began with Serverless 5926, condition A, on 2026-11-09 at
22:29 UTC. Live coverage and outcomes are in `analysis/aggregate.json`; do not
interpret in-progress partial rounds as a completed comparison.

## Reproduction

Use Node 24.15.0 and the pinned package lock on Windows with preflighted Codex
MXC support and PowerShell 7. Provision the evaluator-only Suffice subscription
profile at `~/.suffice/auth.json`; never copy it into Git, reports or an actor
workspace. Reconstruct sealed records from the SHA-pinned dataset using
`python scripts/select-intelligence-v4.py`. Install dependencies with `npm ci`.

1. Run `node scripts/preflight-intelligence-v4.mjs` for offline boundary, graph
   and catalog checks; `--models` incurs four additional disjoint smoke runs
   against the current ledger.
2. Run `node scripts/prepare-intelligence-v4.mjs --task=ID` for each next task.
   Preparation provisions pinned dependency locks and original/reference gates.
3. Run `node scripts/campaign-intelligence-v4.mjs` to execute serial balanced
   rounds and stage later environments. It uses the existing session loop and
   stops on provider/configuration/evaluator faults or the spending/resource cap.
4. Run `node scripts/report-intelligence-v4.mjs` to rebuild explicit 192-cell
   coverage, paired task tables and uncertainty artifacts from actual receipts.

The published ledger is historical evidence. Reproductions need a separate
campaign/output directory and their own explicitly configured cap; never reset
or overwrite this campaign’s completed attempts. Native dependency adaptation,
source archives, lock hashes, exact revisions and all failed gates are part of
the record, rather than an official portable SWE-PolyBench score.
