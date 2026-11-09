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
The only CLI plumbing change injects that executor; normal CLI defaults and
all intelligence implementations remain unchanged. The agent filesystem tools
retain their existing workspace path guards.

## Four conditions

| Condition | Model | Effort | Intelligence |
|---|---|---|---|
| A | gpt-6-luna | xhigh | off |
| B | gpt-6-luna | xhigh | always-guided |
| C | gpt-6-luna | xhigh | existing on-demand controller |
| D | gpt-6.1-sol | xhigh | off |

All use default tier; the live preflight verifies the exact model, effort and
tier in provider receipts. No fallback model is permitted. Both catalog entries
advertise a 272,000-token context and 128,000 maximum output tokens. Experiment
limits will be lower and identical across conditions. Unspecified decoding
controls remain provider defaults, rather than invented cross-model settings.

The local catalog estimates input/output/cached-input prices per million tokens
as $0.10/$0.50/$0.01 for Luna and $2/$10/$0.10 for Sol. These are recorded catalog
estimates, not invoices or externally verified account billing. Long-context
tiers are retained in machine-readable metadata. The identical effort label
does not establish identical internal computation across models.

## Preflight and isolation

`node scripts/preflight-intelligence-v4.mjs --models` executes four disjoint
infrastructure smoke attempts, one per condition. It verifies real credentials,
actual agent edits, clean independent Git roots, held-out acceptance tests,
public regressions, graph refresh after an edit, cache reuse and complete usage
receipts. These toy tasks are excluded from every engineering success table.

The successful first smoke batch is
`reports/repository-intelligence-v4/preflight/2026-11-09T21-00-04-714Z`.
All four passed with exact xhigh/default receipts; total estimated model usage
was $0.03066122. Failed boundary-launch diagnostics before that batch made no
model requests and remain preserved.

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
frozen in `protocol.json` before primary inference. The existing $12 ledger limit
continues to apply unless the user supplies a new v4 budget.

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

## Current state

The audit, isolated four-model smoke batch and primary selection are complete.
No v4 primary attempts have run. Native family runners, final budget/limits,
full analysis and primary execution are still in progress.
