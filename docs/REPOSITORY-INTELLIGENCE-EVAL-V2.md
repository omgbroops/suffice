> HISTORICAL PROTOCOL: the completed easy-suite study is preliminary because of parent Git inheritance and saturation. Git isolation is now fixed. The user requested harder tasks; no corrected main replay was launched. Continue from [the cloud handoff](CLOUD-HANDOFF-REPOSITORY-INTELLIGENCE-V2.md).

# Evaluation v2 protocol

Base `codex/repository-intelligence-v1`, commit `2670266`; work is isolated on
`codex/repository-intelligence-eval-v2`. The research question concerns accepted
engineering work, not whether an index can retrieve its own fixture symbols.

## Frozen treatments and model

A is the normal Suffice CLI with intelligence off. B is the existing always-guided
extension. C uses `--intelligence on-demand`: no initial graph construction or
context injection; graph calls follow observed exported-module edits, edits to
two or more files, failed verification, or explicit agent graph requests.
Exported-module detection is a cheap textual heuristic, not an exact changed
export assertion. The controller has no access to task category, reference repair,
held-out acceptance, or benchmark labels. It observes source versions and native
tool events, including nested codemode operations. Evidence is bounded and its
reason is logged for every query. Identical observed versions reuse already
delivered evidence; fresh graph queries still validate file contents.

The model is **gpt-6-luna, xhigh**, fixed by the user. No stronger verifier,
router, helper or fallback model is used. The separate three-task pilot checks
the fixed model's capability and saturation; it cannot select a different model
against the user's explicit instruction. Final tasks never tune triggers, model
settings or budgets. If calibration saturates, that remains a reported validity
limitation rather than a reason to alter final tasks after seeing outcomes.

Fast mode was probed with `service_tier: priority`; the returned tier was
`default`. The preflight receipt is preserved. All scored calls explicitly request
the default tier. Effort, requested/returned tier, actual model and usage are
recorded. Provider temperature/top-p defaults are identical across treatments.

Per run: 480 seconds, 60 model turns, 240 tool calls, 16,384 generated tokens per
request including reasoning, $0.50 API-equivalent allowance. Retries are disabled
uniformly. A $0.15 worst-case request reserve guards the allowance before dispatch;
this exceeds the pinned catalog's full-context request bound even at up to twice
its standard rates. The entire experiment, including preflight/pilot, has a $12
API-equivalent cap. Every dispatched run reserves its full allowance; missing
usage retains that reservation. Costs are subscription API-equivalent estimates,
not invoices. Failed/incomplete/provider attempts are retained. No silent reruns.

## Dataset and prospective strata

24 tasks: eight simple, eight cross-file, eight complex. Ten are pinned actual
upstream fixes from npm/node-semver (seven) and nodeca/js-yaml (three). Eleven
reuse explicitly synthetic Suffice contracts. Three compound tasks combine
existing synthetic subsystems and require all contracts to pass; they do not
claim to be integrated real-world issues. This mixed dataset is a practical
compromise and cannot be advertised as 24 independent real repository issues.

Every baseline fails held-out assertions, every reference repair passes them,
and both baselines and references pass required public regressions. Preparation
records upstream revisions/archive hashes, source inventory, acceptance hashes,
reference changed files and test output. Test criteria existed independently of
the evaluated model's attempts. Categories and rationale are assigned before
inference. “Simple” means localized repair, not proven ease; “complex” includes
multi-invariant stateful work and conjunctions of subsystems, not a validated
psychometric difficulty scale. Shared repositories, component contracts and past
use create correlation and contamination risks.

Source-only workspace copies preserve repository layout. All configurations get
the same task README, files, shell, Node version and public tests. Acceptance and
reference repairs stay outside agent workspaces. The harness does not expose
acceptance as a model tool. Native shell tools are not an OS sandbox: authorized
scope is enforced by the prompt and post-run immutable-file checks, not isolation
from a malicious agent inspecting parent paths. All original files, including
hidden metadata, are hashed; only existing permitted production files may change.

## Schedule, grading and analysis

Two fresh sessions/workspaces per task/configuration give 144 primary attempts.
Seeded category-interleaved task order and randomized arm order balance temporal
effects. Six optional tools-available diagnostics are separate, never pooled into
the primary denominator. Provider cache warmth is observed, not reset; repetitions
are independent sessions, not a guarantee of independent service behavior.

An operational amendment after the first 30 primary attempts increases concurrent
capacity from six to twelve isolated runs. No task, model, decoding, per-run
allowance, controller or grading changes are allowed. Resume compares every
manifest field except the runner hash and concurrency, preserves canonical trial
IDs, and retains the original frozen runner plus an exact diff and amendment.
All three treatments for each task remain in the same concurrency phase.

Success requires normal agent completion, held-out acceptance, required public
regression, intact immutable files and the requested model/effort. Infrastructure,
budget/truncation and assertion failures are separate. Raw provider/tool events,
session logs, exact patches and test results are retained. Unknown usage is not
zero. Missing scheduled attempts remain visible in every report.

Report acceptance by category, paired outcomes, task-cluster bootstrap intervals,
token/cost/time/iteration/tool counts, graph query reasons/overhead and cost per
accepted task. Intervals are descriptive under task dependence and small strata;
they do not cure contamination or synthetic-task selection. Report upstream and
synthetic outcomes separately, including unsupported CommonJS module resolution.

Changed files outside the reference patch and untouched reference files are
**proxies**, not ground-truth unnecessary edits or missed dependencies. Alternative
correct implementations can legitimately differ. Actual failed regression and
acceptance cases are the correctness evidence. Later reads/edits/tests that match
graph recommendations provide an observable uptake trace, not proof that the
query caused an action. Without randomized component ablations, initial context,
dependency discovery and test-selection effects cannot be causally separated.

Graph baseline starts on activation in C. Explicit path seeds include earlier
observed edits, but changed-symbol deltas describe the activation snapshot rather
than inventing a graph that existed at task start. C still pays cheap full-source
hash scans at top-level tool boundaries; graph laziness does not mean zero cost.

## Reproduction

```sh
node scripts/prepare-intelligence-eval.mjs
node scripts/intelligence-eval-preflight.mjs
node scripts/intelligence-eval.mjs --phase=pilot
node scripts/intelligence-eval.mjs --phase=main
# Resume only unchanged frozen inputs: --resume
node --test tests/*.test.mjs packages/cli/test/*.test.mjs
```

The signed-in CLI home provides subscription credentials through the existing
ModelRuntime; no credentials are copied to artifacts and no API-key fallback is
enabled. Workspaces/frozen inputs live under `.suffice/intelligence-eval-v2/`;
reviewable manifests, dataset, spending reservations, machine results and raw
events/sessions live under `reports/repository-intelligence-eval-v2/`.
