# Repository intelligence v4 research protocol

Collection is ongoing. The original design below is preserved; the appended
resource and Priority amendments describe actual execution changes. See
`reports/repository-intelligence-v4/effective-protocol.json` for the combined
policy and `analysis/RESULTS.md` for the latest completed-attempt snapshot.

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

## First execution checkpoint and resource recovery

The first two prospective model attempts finished normally with complete exact
configuration receipts: Serverless 5926 A failed strict acceptance ($0.01768258,
34 requests), and B failed strict acceptance ($0.01814198, 14 requests). These
are two observations on one issue, not a paired study result. No configuration
has both repetitions yet and neither C nor D has an executed model attempt at
this checkpoint. The D launch stopped at the resource preflight with zero
provider requests and known zero cost; it is an infrastructure launch record.

During B the host's available RAM dropped from 2.90 GiB to 0.57 GiB and available
disk from 13.40 GiB to 3.75 GiB. Its worker's sampled final RSS was about 304 MiB;
other desktop workloads were active, so the host-wide loss cannot be attributed
to the graph alone. The Windows pagefile subsequently measured 20.01 GiB; its
previous size was not measured, so pagefile growth is an inference, not a proven
accounting of the disk delta. Resource floors were retained. Three reproducible
v4 Three.js setup-clone groups were removed after verifying the pinned archive
and preserved framework reports; baselines, sealed patches and raw model
trajectories remain. This restored free disk to 9.49 GiB. The interrupted earlier
v3 cleanup was not resumed.

`infrastructure/resource-recovery-amendment.json` permits recovery only of the
zero-request, zero-cost D resource launch and dispatch of the unstarted C cell.
The original D receipt remains under a0. Its first real model attempt uses a1
and a derived worker whose only differences are the storage suffix and attempt
metadata, recorded by SHA-256. No coding failure is retried. Models, effort,
limits, prompts, controller and grader stay frozen. The recovery process waits
for at least 2 GiB available RAM and 6 GiB disk before sending any request.

The same task exposed a possible solution-specific oracle: its issue describes
API Gateway deployment dependencies, while held-out tests require a specific
new variable API absent from the issue text. The strict grade is retained; no
claim is made that either failed patch is behaviorally correct. This concern
was recorded after A and before B/C/D outcomes and remains a construct-validity
limitation, not a reason to replace this task after observing results.

B's first cold graph refresh parsed 400 files in 2.796 seconds. Its largest
serialized graph was 29.48 MiB, and all graph refreshes totaled 29.064 seconds.
Net heap deltas are not peak memory measures; GC and concurrent desktop activity
limit attribution. These numbers describe one task, not repository-wide
performance or an engineering accuracy advantage.

Completed Public attempt state is moved, without deleting bytes, into ignored
evaluator-only archives after patches and trajectories are published. This
bounds the native sandbox deny-list length and preserves caches for audit.
Historical source/graph implementations and default CLI behavior are unchanged.

## Frozen task sources and interpretation limits

All tasks are public historical changes and may be training-contaminated. The full commit and record/test hashes are in `cohort.json`; these source links are for evaluator audit and are unavailable over the actor network. Categories describe reference change breadth. The table does not certify that every valid alternative implementation passes the upstream tests.

| Source | Category | Main interpretation limit |
|---|---|---|
| [prettier/prettier #12930](https://github.com/prettier/prettier/pull/12930) | simple | Exact formatting snapshots may cover more cases than the motivating example. |
| [prettier/prettier #10187](https://github.com/prettier/prettier/pull/10187) | cross-file | Exact formatting snapshots may cover more cases than the motivating example. |
| [prettier/prettier #9521](https://github.com/prettier/prettier/pull/9521) | cross-file | Exact formatting snapshots may cover more cases than the motivating example. |
| [prettier/prettier #9866](https://github.com/prettier/prettier/pull/9866) | cross-file | Exact formatting snapshots may cover more cases than the motivating example. |
| [prettier/prettier #12260](https://github.com/prettier/prettier/pull/12260) | cross-file | Exact formatting snapshots may cover more cases than the motivating example. |
| [prettier/prettier #11892](https://github.com/prettier/prettier/pull/11892) | complex | Exact formatting snapshots may cover more cases than the motivating example. |
| [prettier/prettier #12584](https://github.com/prettier/prettier/pull/12584) | complex | Exact formatting snapshots may cover more cases than the motivating example. |
| [prettier/prettier #13019](https://github.com/prettier/prettier/pull/13019) | complex | Exact formatting snapshots may cover more cases than the motivating example. |
| [prettier/prettier #8381](https://github.com/prettier/prettier/pull/8381) | complex | Exact formatting snapshots may cover more cases than the motivating example. |
| [serverless/serverless #6977](https://github.com/serverless/serverless/pull/6977) | simple | Unit-level/private-helper assertions may constrain implementation choices. |
| [serverless/serverless #4372](https://github.com/serverless/serverless/pull/4372) | cross-file | Unit-level/private-helper assertions may constrain implementation choices. |
| [serverless/serverless #5509](https://github.com/serverless/serverless/pull/5509) | cross-file | The proposal shows a stage.description shape; API/property naming needs scrutiny against the held-out configuration fixture. A mismatch is possible, not established by label inspection. |
| [serverless/serverless #5728](https://github.com/serverless/serverless/pull/5728) | cross-file | Held-out labels name a new suppressLogIfPrintCommand helper, while the issue specifies clean print output. A behaviorally equivalent inline fix could fail a helper-specific test. |
| [serverless/serverless #5640](https://github.com/serverless/serverless/pull/5640) | cross-file | Unit-level/private-helper assertions may constrain implementation choices. |
| [serverless/serverless #4576](https://github.com/serverless/serverless/pull/4576) | cross-file | The issue requests --template-path; the failing label targets walkDirSync noLinks, an internal helper contract not explicitly named in the issue. |
| [serverless/serverless #5299](https://github.com/serverless/serverless/pull/5299) | complex | Unit-level/private-helper assertions may constrain implementation choices. |
| [serverless/serverless #5926](https://github.com/serverless/serverless/pull/5926) | complex | Potential solution-specific variable API; see the recorded contract concern. |
| [serverless/serverless #4892](https://github.com/serverless/serverless/pull/4892) | complex | The proposal offers alternative configuration shapes rather than one finalized option name. Held-out tests constrain a specific plugins-object/local-path interface. |
| [serverless/serverless #4754](https://github.com/serverless/serverless/pull/4754) | complex | Unit-level/private-helper assertions may constrain implementation choices. |
| [mrdoob/three.js #14836](https://github.com/mrdoob/three.js/pull/14836) | simple | Historical API expectations and external linked repros; QUnit TODOs remain distinct from passed cases. |
| [mrdoob/three.js #24461](https://github.com/mrdoob/three.js/pull/24461) | simple | Historical API expectations and external linked repros; QUnit TODOs remain distinct from passed cases. |
| [mrdoob/three.js #18648](https://github.com/mrdoob/three.js/pull/18648) | cross-file | Historical API expectations and external linked repros; QUnit TODOs remain distinct from passed cases. |
| [mrdoob/three.js #23796](https://github.com/mrdoob/three.js/pull/23796) | cross-file | Historical API expectations and external linked repros; QUnit TODOs remain distinct from passed cases. |
| [mrdoob/three.js #22566](https://github.com/mrdoob/three.js/pull/22566) | cross-file | Historical API expectations and external linked repros; QUnit TODOs remain distinct from passed cases. |

## Post-restart resource-policy amendment

The resource-wait recovery completed C and Sol Medium before the user's restart.
There are four executed, fully receipted primary attempts on Serverless 5926: all
four completed normally and failed the frozen acceptance criteria. Estimated
cost including five smoke attempts is $0.16922650 at this checkpoint. No paired
task has both repetitions yet. The zero-request Sol launch remains separate.

On November 9 (Chicago time), the user explicitly authorized trying the serial
experiment while studying after restarting the PC. Available physical RAM was
still about 1.1 GiB, with about 21.2 GiB disk available. An offline sandbox,
graph-invalidation/cache and catalog preflight passed again after reboot,
without further model calls. Its UTC artifact timestamp is November 10.

The immutable original protocol and source archive remain intact. The explicit
`infrastructure/low-memory-amendment.json` records derived admission executors:
parent/preparation minimum free RAM 0.75 GiB, worker minimum 0.5 GiB. The minimum
disk remains 6 GiB, worker heap remains 768 MiB, test-child heap remains 384 MiB,
and concurrency remains one. Models, efforts, prompts, tools, graph/controller,
grading and per-attempt token/wall/tool limits remain unchanged. The $25 ledger
continues to include all earlier v4 cost. No coding outcome is retried.

`node scripts/run-intelligence-v4-low-memory.mjs` verifies all frozen originals,
reproduces the declared changes, hashes the generated executors, and starts the
remaining schedule. Import paths are rebased to the same original modules.
`--check-only` verifies the derivation without requesting a model. New manifests
and results carry the resource-policy phase and policy hash. Aggregate results
include phase-stratified four-condition rounds, and the initial four runs must
not be described as having identical host starting conditions to later runs.

Lower launch floors can increase paging and runtime variability; they do not
raise the fixed heaps or prove sufficient physical headroom. Actual per-attempt
resources and infrastructure failures remain part of the reported outcome.

## User-requested Priority probe and prospective tier phase

The user chose to keep Luna xhigh and try Fast/Priority for speed. Two disjoint
one-request availability probes succeeded, one per model, requesting Priority.
Both raw responses reported `default`; server-confirmed Priority is therefore
unproven. These are not engineering attempts or a controlled speed comparison.
Their complete receipts and conservative spending reservations remain separate.

The installed Codex provider explicitly resolves a default response to the
requested Priority option and applies a 2x catalog pricing estimate for these
model IDs. Initial probes injected the payload field; the prospective executor
also forwards the actual provider stream option, so the SDK's fallback and cost
accounting see the request. Requested and raw reported tiers are both retained.
No claim of faster serving follows merely from request acceptance.

`infrastructure/priority-amendment.json` hashes the derived executors and policy.
Serverless 5926 and Three.js 23796 had already started and finish both repetitions
on default tier across all four configurations. All later tasks request Priority
across all four configurations. Models, effort, prompts, graph/controller, tools,
grader and common token/wall/tool budgets stay frozen. Priority emergency dollar
ceilings and request reserves scale by two to preserve the original inference
allowance under the SDK's price estimate; the total cap remains $25. Complete
round reservations can conservatively stop a balanced subset below $25 actual
estimated use. A tier-dependent budget stop stays explicit.

The serial controller now supports an evaluator-only `control.json` pause flag
and audited continuation of never-dispatched slots. The first hold used the
serial-admission lease: the active attempt finished; the next launch rejected
the held lease before any provider request or workspace creation. That launcher
error is an operational pause, not a model failure. Existing coding outcomes
are never repeated. All prior trajectories and the pause receipt are preserved.

Run `node scripts/run-intelligence-v4-priority.mjs --check-only` to verify the
derivation without inference, and omit `--check-only` for serial continuation.
The report separates requested-tier and resource-policy phases; it does not
describe the mixed collection as identical serving conditions.

## Correction to the Priority provider interpretation

Live inspection found that both catalog entries use `openai-responses`, not
`openai-codex-responses`. The earlier explanation invoking the Codex-only
pricing fallback was incorrect. It remains in the original amendment as a
historical assumption and is superseded by
`infrastructure/priority-provider-correction.json`. No raw trajectory is edited.

The regular provider uses the server-reported tier. Its simple-options builder
omits the provider-specific `serviceTier` option, although Suffice's existing
payload hook still sends `service_tier: priority`. Both availability probes and
the first live Priority-requested trajectory report `default`. Fast processing
is therefore not confirmed active. Successful request acceptance is not treated
as proof of higher-speed serving. Actual SDK costs remain default-tier estimates
when the response reports default; they are not manually doubled.

The correction resolves only the two probes' earlier pricing-only unknown flags
from complete receipts and actual provider metadata. Original probe JSON and the
old/new ledger values remain preserved. No historical missing-usage reservation
is erased. The conservative doubled emergency ceilings and request reservations
remain explicit limits protecting the $25 cap if Priority is later served; they
are not claims of actual charges. All four configurations on each subsequent
task still receive the same requested tier and common token/wall/tool limits.

The active serial worker subsequently restored its earlier whole-ledger snapshot,
including the two conservative probe reservations. The correction resolves the
pricing interpretation; final ledger reconciliation is deferred until no writer
is active. Main attempt charges remain intact. The ledger's conservative flags
should not be described as missing token receipts for these two probes.


## Interim overhead interpretation

The frozen intelligence implementation serializes public graph queries through one
promise queue (`packages/cli/src/intelligence/graph.mjs`). Refresh latency begins
inside that queue and ends after validation, relinking and any cache write. The
report sums completed refresh durations, including zero-reparse validation scans.
This is measured graph activity, not a causal estimate of exclusive wall time: it
may overlap other asynchronous tool execution, and no missing completion event is
assigned zero work. Per-attempt agent and worker wall time remain separate.

Three.js B repetition 0 recorded 13 completed refreshes totaling 84.272 seconds
during a 223.357-second agent phase. Its cold graph serialized to 278,683,125 bytes
and the recorded cold heap delta was 649,970,312 bytes. Prettier B repetition 0
recorded 34 completed refreshes totaling about 432 seconds during an approximately
886-second agent phase; its cold graph was 34,080,498 bytes across 4,239 files.
These examples show repository-density-dependent overhead and the cost of repeated
freshness validation. Serialized graph size and a single heap delta are not peak
process memory. The current graph and controller remain frozen for the experiment;
optimizing them after observing these tasks would require a new evaluation phase.

The effective protocol separates common inference limits from the task-dependent
service policy. It does not label all attempts as requesting default service.


## Zero-request resource continuation and thermal check

At 01:03 Chicago time on November 10, the serial campaign stopped before any
provider request on Serverless 6977 D repetition 0. Its worker sampled about
358 MiB free RAM, below the unchanged 0.5 GiB launch floor. The original a0
receipt and zero cost are retained; this was not a model failure.

After the user reported improved host conditions, live checks found about
3.74 GiB free RAM and CAM visually showed 67 degrees C. CAM's accessibility tree
did not expose sensor values. This single visual observation does not provide
an unattended 85-degree guard. Concurrency remains one under the user's earlier
condition; no parallel inference phase has been collected.

`node scripts/continue-intelligence-v4-resources.mjs --check-only` validates the
Priority-derived worker and identifies only resource-stopped cells with exactly
zero requests and zero cost and no existing a1 result. Without `--check-only`,
it acquires the existing exclusive lease, checks cap headroom for the remaining
balanced round, reserves the recovery slot, records the recovery derivation,
and executes the cell's first model attempt as
a1. The derivative changes only the storage suffix and attempt number. It then
continues the existing serial Priority campaign. It never retries a coding
outcome or a request with unknown usage, and it preserves all original files.

The two complete default-tier availability-probe ledger entries were reconciled
while no worker was active and the exclusive lease was held. The Prettier 8381 B
repetition 0 timeout has 49 requests and 48 final usage responses; its unresolved
request remains conservatively reserved and its cost is unknown. Its known usage
is a lower bound, not a fabricated complete cost or a zero-cost failure.


## User-requested removal of further repetitions

On November 10 the user requested one run per configuration per task. At that
boundary 16 second runs had already been executed, covering four tasks. The
active first run finished; a pause flag prevented any additional second run.
The amended primary target is 96 (24 tasks x four configurations x one first
run). Existing repeats and all spending remain preserved, with repeats reported
separately rather than selected or pooled based on outcome. Two unsupported
environments currently account for eight blocked first-run cells.

`infrastructure/single-repetition-amendment.json` and `effective-protocol.json`
record the change. `scripts/run-intelligence-v4-single.mjs` derives the existing
Priority coordinator by filtering its dispatch loop to repetition zero and
changing its displayed target to 96. Its worker, models, efforts, task inputs,
first-run arm order, grading, graph/controller, limits and serial execution stay
unchanged. The original 192-cell protocol and pre-amendment report snapshot in
`analysis/pre-single-repetition/` remain intact.

Continue with `node scripts/continue-intelligence-v4-resources.mjs`; it selects
the amended controller whenever this amendment exists. For an offline derivation
check use `node scripts/run-intelligence-v4-single.mjs --check-only`. Updated
paired-analysis tests verify that favorable later repetitions cannot alter a
first-run primary result. Unexecuted second-run rows carry `removed_by_user`
and are not missing primary attempts.

The reduced design weakens reproducibility assessment. Retaining the original
first-run order also removes two of the four Williams-order rows, so the earlier
full position/carryover balancing claim no longer applies. The size and timing
of this user-driven amendment follow observation of partial outcomes and must
remain visible; results are exploratory, with no claim of unchanged prospective
conditions or proof of equivalence.


## Disk-floor stop and continuation

The main campaign reached 69 model attempts before the Prettier 12930 guided
launch stopped twice with zero provider requests and zero cost. RAM was above
the floor; free disk was about 5.98 GiB, below the unchanged 6 GiB minimum. The
recovery wrapper stopped and its running label was stale; raw a0/a1 receipts
remain preserved. By the next check free disk had fallen to about 3.15 GiB.

Only reproducible generated scratch was reclaimed after verification: the
completed Three.js 24461 gate group and extracted upstream source copies for
Three.js 24461 and 23796. Pinned source tar hashes and preserved baseline hashes
were checked first; all model patches, raw reports, sealed records, dependencies
and validated baselines remain. Exact resolved paths and the free-space change
are recorded in `infrastructure/reclaimed-completed-v4-scratch-2026-11-10.json`.
Free disk returned above 6.5 GiB; no model or grading limit was lowered.

The resource continuation wrapper now handles consecutive zero-request,
zero-cost launch stops using increasing storage suffixes, with an explicit
CLI attempt number. It checks RAM and disk before attempting recovery, records
the derived worker hash, and does not retry any coding outcome or dispatched
request. Analysis follows only this consecutive zero-request chain; a2 is the
first actual model attempt when a0 and a1 both stopped before inference.
