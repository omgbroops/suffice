# Cloud handoff: repository intelligence evaluation

Continue in `sufficelabs/suffice`, branch **`codex/repository-intelligence-eval-v2`**.
This branch descends from `codex/repository-intelligence-v1` (`2670266`), which
was based directly on `codex/suffice-cli-alpha` (`124e0e1`). Do not restart from
or merge the earlier semantic/implicit trial branches.

## Latest user direction

The user is moving execution to cloud Codex. Preserve the work, then continue
the stronger evaluation there. **Use `gpt-6-luna` at `xhigh` for every benchmark
configuration**, including calibration. Fast mode is allowed if actually
supported. A local probe requested `priority` but received `default`; all local
scored calls explicitly used `default`. Check the cloud endpoint and record the
returned tier rather than assuming Fast mode is active. Do not silently change
models, lower effort, or use stronger routing/verification helpers.

The user specifically rejected the saturated task set and asked for **harder
tasks**. Do not spend another 144 runs replaying the easy suite. First build a
more representative, difficult suite and a separate calibration pilot. Keep
model/effort fixed. Prefer real cross-file production issues with independently
established tests, not small synthetic utilities or disconnected compound tasks.

## What exists

* `docs/REPOSITORY-INTELLIGENCE-AUDIT.md` and
  `docs/REPOSITORY-INTELLIGENCE.md`: architecture, schema and original limits.
* `packages/cli/src/intelligence/graph.mjs`, `parse.mjs`, `tools.mjs`: persistent
  Acorn-based evidence graph, three structured tools, always-guided extension.
* `packages/cli/src/intelligence/on-demand.mjs`: optional rule-based controller.
  No initial graph construction; activates after exported-module edits,
  coordinated edits, failed verification, or explicit agent requests. Reasons
  are logged. Source hashing still costs work. No hidden benchmark labels.
* `packages/cli/src/session.mjs`: existing CLI loop with optional resource knobs,
  provider model/effort/tier receipts and intelligence extensions. Native tools,
  AST navigation, codemode and default off behavior are preserved.
* `src/intelligence-eval.mjs`: snapshotting, seeded balanced schedule and trials.
* `scripts/prepare-intelligence-eval.mjs`: prepares the OLD 24-task suite and
  validates empty/reference/public-regression outcomes.
* `scripts/intelligence-eval.mjs`: pilot/main runner, spending reservations,
  frozen inputs, isolated copies, optional six availability-only diagnostics.
* `scripts/intelligence-eval-report.mjs`, `audit-intelligence-eval.mjs`,
  `intelligence-eval-coverage.mjs`, `archive-intelligence-eval.mjs`: analysis,
  provenance checks, coverage and lossless raw-log archives.
* `tests/intelligence-eval-v2.test.mjs`: controller, schedule and Git isolation
  checks. Latest full suite: **110/110 passed**, including the isolation fix.
  Recheck after installing the pinned dependencies in the cloud environment.

CLI example: `node packages/cli/bin/suffice.mjs --model gpt-6-luna --effort xhigh --intelligence on-demand`.

## Preliminary results — preserve, do not treat as clean causal evidence

`reports/repository-intelligence-eval-v2/luna-xhigh-v2/` contains a completed
**144 primary attempts** (24 tasks × A/B/C × two repetitions), six diagnostics
and three pilot attempts. A separate Fast probe is at the report root.

| Endpoint | A baseline | B always-guided | C on-demand |
|---|---:|---:|---:|
| Independently accepted implementation | 48/48 | 46/48 | 47/48 |
| Normal completion plus acceptance | 47/48 | 46/48 | 47/48 |

The baseline numeric-range repetition timed out at 480 seconds **after producing
a patch that passed acceptance and regressions**. It had 19 provider requests
and only 18 final usage receipts. Keep its total cost unknown; known components
are lower bounds. Do not manufacture a graph accuracy rescue from a missing
final response. Three guided correctness misses share tenant live-delivery
filtering in standalone/compound variants; they are correlated failures.

The availability diagnostics passed 6/6 and made zero explicit graph calls.
Their existing tools mode initializes a baseline index without injecting
proactive evidence. A response audit observed 1,520 usage-bearing responses,
all `gpt-6-luna`, `xhigh`, `default`, with no duplicate/missing scheduled trials.
These facts do not establish intrinsic model ranking or graph efficacy.

**Isolation flaw discovered after completion:** copies under `.suffice/` had no
own `.git` and inherited the parent Suffice checkout. Agents ran Git commands
that could consult unrelated status/diffs. A pattern audit found 302 Git/parent
command occurrences; no explicit acceptance/reference-path reads were flagged.
That pattern scan is NOT proof of no leakage. Relative trajectory, timing and
potential accuracy effects are unknown. The earlier comparison is preliminary.
Raw test grades are retained, but do not pool it into a clean validation study.

The old suite was also saturated and poorly matched to the graph hypothesis:
10 old public upstream fixes, 11 small synthetic contracts, 3 disconnected
compounds. All prospectively labeled complex tasks were synthetic/compound.
Pointed specifications and `xhigh` reasoning reduced discovery difficulty.
Saturation is a benchmark-design limitation, not evidence that Luna is a
frontier model or that deterministic repository intelligence can never help.

## Isolation fix and corrected pilot

`initializeWorkspaceGit()` in `src/intelligence-eval.mjs` now initializes and
commits EACH workspace, with fixed author/date, disabled hooks/signing, and
explicit local Git settings. It asserts `git rev-parse --show-toplevel` equals
the workspace and checks that initialization changed no task contents. The new
test places workspaces inside a parent Git repository and verifies independent
roots and identical starting commits/trees for identical inputs.

The runner now namespaces spending reservations by campaign, preventing new
campaigns from colliding with old trial IDs. The corrected pilot under
`luna-xhigh-isolated-v2/pilot/` completed 2/3. **No corrected main campaign was
launched.** The user then requested genuinely harder tasks, so the planned
replay of the same 24 tasks was abandoned before dispatch.

## Continue with harder tasks

1. Inspect the existing code and protocol; retain the agent loop and graph
   implementation unless a concrete correctness issue requires a fix.
2. Select a documented real-issue corpus with independent F2P/P2P checks. Useful
   primary sources investigated, but NOT yet downloaded/adapted:
   * https://github.com/scaleapi/SWE-bench_Pro-os/tree/main/v2
   * https://labs.scale.com/leaderboard/swe_bench_pro_public_v2
   * https://www.swebench.com/multilingual
   SWE-bench Pro V2 ships task-specific public images, instructions, verifiers
   and reference solutions. Verify current revisions and actual setup yourself.
3. Build/verify environments before inference: empty patch must fail the target
   assertions and gold/reference must pass both target and required regressions.
   Keep grading material outside agent context and regrade pristine states.
   Prefer official test criteria over newly invented toy assertions.
4. Pilot separate, representative issues with Luna/xhigh. Aim for meaningful,
   non-saturated baseline performance. If pilot saturates or is zero due to
   infrastructure, fix selection/setup using PILOT data only. Do not tune on
   final held-out outcomes or create difficulty by arbitrarily starving budgets.
5. Freeze 24 NEW holdout tasks, 8 relatively simple but substantive, 8 cross-file,
   8 complex/multi-stage; record provenance, revision and prospective rationale.
   Real issues should dominate complex tasks. Keep the pilot disjoint.
6. Run A off, B guided, C on-demand using identical model, decoding, repository
   trees, environment and budgets, two fresh repetitions each: 144 primary runs.
   Balance/randomize order. Optional availability diagnostics remain separate.
7. Use actual Git-isolated workspaces or task containers. Record root/HEAD/tree
   and verify matched starting revisions. Protect hidden tests and dependency
   state; do not assume prompt restrictions constitute OS isolation.
8. Measure implementation acceptance separately from agent completion, plus
   category outcomes, regressions, iterations, tools, reported tokens, latency,
   graph overhead, known/unknown cost and cost per accepted task. Reference-path
   deviations and temporal action overlap are proxies, not proof of unnecessary
   edits, missed dependencies, or causal evidence uptake.
9. Report paired differences and uncertainty, shared-family dependence, coverage
   and threats to validity. The graph supports explicit ESM paths and lexical
   bindings; CommonJS, JSX, configured aliases and dynamic dispatch can abstain.
   Choose/stratify coverage prospectively; never invent exact dependencies.
10. Produce a detailed Markdown report and preserve all raw machine-readable
    results. Be willing to recommend refine/abandon/default-off. No fabricated
    results, cherry-picked failures, stronger-model fallback, or behavioral proof
    from static dependency relationships.

## Budget, credentials and cloud setup

`reports/repository-intelligence-eval-v2/spending.json` is experiment-wide. The
last local ledger has **$1.19822302 known API-equivalent estimates** and
**$1.67740076 conservatively reserved** against a $12 cap, including the flawed
study, both pilots and probe. Costs are NOT invoices. Preserve these entries;
do not reset the ledger to erase earlier spending. Unknown usage keeps its full
run reservation. If the full study cannot fit, complete a labeled balanced
subset and report every missing planned attempt.

Credentials, `.env`, `.suffice` generated workspaces/caches and `node_modules`
are deliberately not committed. Rebuild inputs from pinned sources and scripts.
The current runtime expects an approved signed-in OpenAI profile under the
Suffice home; cloud Codex credentials may not automatically be available to it.
Use approved cloud secrets/authentication, never commit credentials, silently
enable a new paid-provider fallback, or fabricate inference if auth is absent.

Use Node >=24 and pinned dependencies (`npm ci`). Local Docker CLI was installed
but its daemon was not running; Ubuntu/WSL was present. No Docker service was
started and no new hard corpus was installed. Cloud Linux/Docker may be more
appropriate for official task images. Avoid a wholesale harness rewrite.

Raw preliminary events/sessions are `.jsonl.gz`, with SHA-256/size records in
`archives.json`; `gunzip` restores exact bytes. The corrected pilot's raw streams
are also retained. Review `isolation-audit.json`, original manifests, the
throughput-only amendment, and saved scored source before interpreting old data.
