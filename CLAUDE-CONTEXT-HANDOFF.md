# Suffice — context handoff for Claude

This is a context document from Suffice's owner to a friend's Claude setup. It
records the project, its architecture, the experimental history, results,
failures, and the owner's final decision. It is **not an implementation prompt,
feature request, optimization recipe, or new benchmark authorization**. The
friend will separately explain their own Claude optimizations and intentions.

## The owner's decision, in their intended terms

**V1 is the baseline. V2 and prototype V3 are absolute failures for the owner's
purposes and should be disregarded as starting points.** The owner is deeply
unhappy with V2's accuracy. Its very low model costs did not make up for failed
tasks, and attempts to rescue it with planning, escalation, coordination, or
post-implementation review did not establish an acceptable general result.
This is an explicit product/research decision, not a request to revive them.

The chosen baseline is **`codex/suffice-cli-alpha` in `bycontinuity/suffice`**,
verified at commit **`124e0e194d526064a6b66b951faf4c4d64853f5a`**:
“Restore Pi-native CLI alpha without automatic routing.” This is the original
single-model V1 CLI. It is not the refined-V1 experiment, routing branch, medium
accuracy branch, current research checkout, or experimental Flexible wrapper.

The rejected branches remain preserved as evidence. Their occasional successes
are recorded honestly below, but are not endorsements or reasons to merge them
into the chosen baseline. “Absolute failures” describes the owner's decision;
it does not mean every V2/V3 attempt failed or that no component could ever work.

## Repositories, branches, and what is actually where

Main repository: https://github.com/bycontinuity/suffice

Separate experiment archive: https://github.com/bycontinuity/suffice-experiments

On Sonion, Windows user Eric Qin:

- `C:\Users\Eric Qin\Documents\GitHub\suffice` — actual harness Git repository.
- `C:\Users\Eric Qin\Documents\GitHub\suffice-experiments` — experiment snapshots,
  research, and reports, in a separate Git repository.
- There is no separate `suffice-v2` product repository or extra checkout in this
  two-folder layout. V2 was a branch/policy inside Suffice.
- The Windows Suffice checkout currently holds the experimental research branch
  `codex/suffice-refinement-pilot`. Its root package is named `suffice-v2`; that
  research package name does not identify the desired product baseline.
- The older Mohammed-machine sources remain on that machine. It was turned off;
  the owner explicitly accepted Git commits/pushes and pulling later instead of
  live cross-machine synchronization. No unverified sync is being claimed.

Important preserved branch tips before this handoff's report commits:

| Branch | Commit | Meaning |
| --- | --- | --- |
| `codex/suffice-cli-alpha` | `124e0e1` | Chosen original V1 CLI baseline |
| `main` | `006d4d0` | Merge of the alpha CLI; preserved |
| `codex/suffice-routing` | Remote branch exists | Earlier automatic routing work, not chosen baseline |
| `codex/suffice-v7-experiments` | `2ddc5d0` | Decomp-inspired V2 and 60-attempt issue campaign |
| `codex/suffice-medium-accuracy` | `3aab1c3` | Rejected medium-accuracy calibration |
| `codex/shared-core-ablations` | `bf396d4` | Shared-core interface and 48 ablations |
| `codex/harnesstax-sol61` | `526eee4` | Frozen 120-slot broad comparison |
| `codex/suffice-refinement-pilot` | Continues after `d278cfc` | Refinement, V3, calibration, post-review experiments and final reports |

The repository also preserves older `experiment/*` and `feature/general-v1`
branches. `suffice-experiments/README.md` and `SNAPSHOT-MANIFEST.json` describe
their source snapshots. The final outstanding experiments snapshot was committed
as `85da3fe` on its `main`: 332 files, comprising one modified attributes file
and 331 previously untracked source/report/research files.

## What V1 actually is

Suffice is a **Pi-based coding-agent harness and CLI**, not an independent model,
terminal UI engine, or proprietary replacement for Pi. The pinned dependencies
include `@earendil-works/pi-ai` and `@earendil-works/pi-coding-agent` 1.2.0.
The baseline package requires Node.js 24+. Its supported CLI model catalog is
OpenAI; availability depends on the signed-in account. “Flexible” meant the
available model/effort could be selected, not that every provider integration
had already been implemented.

V1 already had substantial harness work before the friend's optimizations:

- Pi's native interactive terminal editor, rendering, settings/session controls,
  model selector, login, and session machinery.
- Suffice project selection (`/project`, `/cd`, `--cwd`), recent project handling,
  per-project sessions, print mode, doctor, continuation, and usage reporting.
- A short fixed system prompt requesting investigation of relevant contracts,
  minimal correct edits, appropriate verification, batched independent tools via
  codemode, serialized edits before verification, and honest claims about checks.
- Codemode as the model-facing execution interface. Native read/edit/write/Bash
  and repository navigation are available through it. Inline budget is 2,000.
- `symbols`, `symbol_read`, and `symbol_references` navigation using Acorn and
  TypeScript stripping. References are syntactic name matches, **not a semantic
  call graph**. TSX/JSX and unsupported TS require ordinary reads/searches.
- Repository-root path guards on file tools, explicit scratch allowance, event
  receipts, provider-request identity/usage instrumentation, and cost/time/tool
  accounting. Bash still executes with user permissions: no OS sandbox is supplied.
- Existing provider caching behavior; cache warming was off. Append-only session
  history and automatic compaction disabled in this baseline.
- Automatic external extensions, skills, prompt templates and themes disabled;
  `noSkills: true`. Project context files such as `AGENTS.md` can still load.
  This is why a Claude hooks/skills directory cannot simply be dropped in and
  assumed to execute.
- Engine analytics/install telemetry disabled; normal provider access/login and
  some Pi helper behavior retained. The CLI credits Pi in documentation/notices.

Relevant alpha files are `packages/cli/src/session.mjs`, `tools.mjs`,
`navigation.mjs`, `workspace.mjs`, `interactive.mjs`, `main.mjs`, `options.mjs`,
`projects.mjs`, plus `packages/cli/README.md` and CLI tests.

At the verified alpha revision, interactive default is Sol Low. Default task
allowances in the CLI are 600 seconds, 60 assistant responses, 240 tool calls,
and $10 API-equivalent cost; commands cap at 180 seconds. These are product
defaults, **not the settings of every benchmark**. Cost checks occur between
responses, so one response may overshoot. The CLI supports explicit overrides.
OAuth uses the user's own OpenAI account; there was no API-key fallback in the
preview. Credentials/session logs live privately under the configured Suffice
home and are not part of this handoff.

The alpha was a clone-run preview, not a confirmed npm publication. Its README
documents `npm ci` followed by `npx suffice` inside the checkout. Product
publication/licensing was not completed. Benchmark results do not certify the
interactive CLI release's behavior, security, or production readiness.

## Model names and experimental names

The terminology used throughout this work:

| Name | What it meant |
| --- | --- |
| Sol | GPT-6.1-Sol, stronger and more expensive model in these tests |
| Luna | GPT-6-Luna, cheap worker model |
| Astra | Discussed, never benchmarked in these experiments |
| Original V1 | Single-model baseline; most later controls used Sol High |
| Refined V1 | Experimental isolated-task scope guidance and conditional same-model repair |
| Concise V1 | Communication-concision instruction treatment |
| V2 / Efficient | Luna worker plus optional Sol Low assistance over extra execution machinery |
| V3 / Orchestrated | Sol High coordinator delegating to Luna High; coordinator lacked general editing/shell tools |
| Post-review prototype | Luna High implementation, then mandatory bounded Sol Low review, optionally one Luna repair |

The post-review prototype was an experimental V2 strategy called
`efficient-review`, **not V3**. It is easy to confuse the separate experiments.
“Auto” as a public product mode and configurable worker/expert model pairs were
discussed but not validated product releases. No experimental default was promoted.

## How the friend's decomp repository entered the story

The owner supplied `decomp-v2-dev.zip` and was excited by a friend's claimed
roughly 97% accuracy and large savings using Claude Haiku/Opus optimizations.
The friend's Claude knows its own optimizations and the friend will explain
them separately. This handoff does **not** establish that claim on the same
tasks, models, budgets, graders, or accounting as Suffice.

Prior inspection distinguished a thin winning v7 benchmark setup from a larger
optional hook bundle. Files discussed included `bench/v7.py`, `bench/v6.py`,
`bench/arms/THIN/`, `bench/fullpack/cheats/`, `guard/hook.py`, `guard/inject.py`,
expanded A7 settings, benchmark reports, and `docs/ROUTER.md`.
The quoted earlier ChatGPT analysis described: a minimal prompt/four tools,
Bash output caps, language guidance, batched Opus advice for Haiku, and
deterministic compile/retry stages. It distinguished that from a full adaptive
router proposed in documentation and from hooks not used in the headline run.
No packaged `SKILL.md` files were identified in that ZIP's prior inspection;
it contained guidance files and a Superpowers planning document. Any separate
friend-specific skills/hooks not in that snapshot were not established here.

A stronger model planning for many cheap workers is not automatically an
adaptive router. Suffice explored several distinct assistance policies rather
than reproducing an established one-to-one Claude configuration. Pi lifecycle
and codemode required native integration; Claude Code hook scripts were not
assumed compatible. Suffice's 13.6x/95–97% excitement was never proof that the
friend's result transferred.

## What was added experimentally

V2 accumulated thin execution profiles, bounded prepared context, compact
project/task guidance, recoverable output control, advisory notices, explicit
public verification, repair/escalation policies, and optional runbooks.
Complete observations were retained outside the model-facing capped output
with retrieval available. Output caps were meant to keep irrelevant text out
of context without destroying evidence. Prepared context was deterministic,
not free model-generated advice.

Assistance variants included upfront Sol Low plans; selective advice triggered
by observable public failures; one cheap-model repair; Sol takeover; and later
mandatory post-implementation review. These were not one stable “V2” setting:
each campaign manifest pins the actual treatment.

The shared execution interface retained Flexible (model/effort selection) and
Efficient (Luna default) modes without replacing the production CLI. Prepared
context, output control, contracts and notices were separately ablated. Full
Claude read/retry/session/polling/handoff hooks were not blindly enabled together.
Automatic skill loading stayed disabled rather than injecting all skills globally.

Important experimental code is under `src/execution/`, `src/pipeline/`, and
`benchmark/`; those directories on the current research branch are not a
description of the alpha CLI's production defaults.

## Evidence rules that explain apparently conflicting numbers

All dollar figures here are **API-equivalent estimates**, not invoices,
subscription charges, or a conversion of dollars into Codex weekly usage.
Provider/cache/input/output receipts and catalog price tiers underpin them.
Reasoning tokens within output are not an extra charge on top of that output.
Coordinator/developer inference and environment/grader compute are outside
actor inference cost unless a report explicitly says otherwise.

Failures count toward cost per accepted task. Missing bills are unknown,
not zero; sums with missing costs are floors. Accepted patch, clean policy-valid
completion, public smoke-check pass, and successful grader execution are different
states. Some patches passed grading despite an actor timeout or broken review.
“Ungraded” is not a demonstrated code rejection.

The agent cannot see a private grader's verdict during implementation or use
its cases as an escalation signal. Public checks are partial. Sol assistance
was frequently dormant because checks were absent, unavailable, or passed while
independent acceptance failed. Not escalating was often the configured behavior,
not a provider refusing to call Sol and not evidence the patch was correct.

Most cohorts had one attempt per task/arm, with small samples and unreset cache
state. Different task distributions, effort levels and runtime limits matter.
Only explicit same-model/effort contrasts isolate relevant harness treatments.
Infrastructure replacements were specifically authorized; excluded originals
and their incurred costs remain separately retained. They were not erased.

## Chronology and measured outcomes

### Earlier V1 research and the CLI baseline

There were earlier experiments on tools/interfaces, source presentation, AST
retrieval, caching, state/history, research workflows, evidence, recovery,
parallelism, field issues, and model/effort. The separate experiments repository
preserves these snapshots rather than requiring this document to reproduce
every result. Its major directories include `general-v1`, `external-pi`,
`interface-friction`, `source-presentation`, `retrieval`, `cache-retention`,
`failure-recovery`, `evidence-record`, `adaptive-effort`, `field-campaign-v1`,
and other benchmark/research snapshots. Old experiment branches remain in Suffice.

The positive premise was that the Pi-based V1 harness could perform useful work
efficiently. Later results did not support a blanket superiority claim over Pi.

### Initial three-issue V2 pilot: why excitement was so high

`reports/pipeline-bench-v1/RESULTS.md`: nine attempts total.

| System | Acceptance | Cost | Mean agent seconds |
| --- | ---: | ---: | ---: |
| Native Codex, Sol Low | 2/3 | $0.25699400 | 42.389 |
| Original V1, Sol Low | 2/3 | $0.13287760 | 40.405 |
| V2, Luna High | 3/3 | $0.02084424 | 87.049 |

V2 cost/accepted task was about 94.6% lower than Codex on this tiny cohort but
took over twice V1's time. Every V2 attempt finished with Luna alone: zero advice,
controller repairs or takeovers. It used more calls/tokens, not less work.
Much of the cost gap came from model pricing. The three issues included ws,
fast-xml-parser, and Commander. These results were not a general accuracy claim.

### Lower-effort and rejected medium-accuracy work

`reports/effort-bench-v1/`: Luna Medium V2 passed 2/3, cost $0.00927542,
mean 63.473 seconds. Original V1/Luna High passed 2/3 at $0.01598388,
mean 93.202 seconds. The earlier V2 High 3/3 was a historical, not contemporaneous,
control. Medium missed Commander compatibility despite passing public checks.

The owner wanted medium accuracy improved without tuning to the exposed tasks.
The resulting branch `codex/suffice-medium-accuracy` was rejected as slower and
more expensive: 2/3 accepted again, $0.02359618 total and 139.228 seconds mean,
versus historical Medium's $0.00927542 and 63.473 seconds. The owner returned to
the preceding V2 branch. Its exact replay
and review evidence remain in that branch's `reports/accuracy-bench-v1/` and
`reports/accuracy-implementation-v1/`. The 40.57% number below is not a result
of promoting that medium-accuracy treatment. The conversational 57.4% figure
should not be substituted for the verified broad-cohort figure.

### Fifteen JS/TS issues × four configurations: 60 attempts

`reports/broad-bench-v1/RESULTS.md` and `ASSESSMENT.md` are authoritative.

| Configuration | Patch acceptance | Known cost | Mean seconds |
| --- | ---: | ---: | ---: |
| Native Codex / Sol Medium | 11/15 | ≥$1.72148720 | 74.8 |
| V1 / Sol Medium | 11/15 | $1.02299960 | 61.3 |
| V2 / Luna High | 10/15 | $0.07232666 | 93.5 |
| V1 / Luna High | 9/15 | ≥$0.06697234 | 85.6 |

This is the source of **40.57% lower recorded cost for V1 vs native Codex**
with equal strict patch acceptance. V2's roughly 95.8% recorded-spend reduction
came with fewer passes and a cheaper model. Two capacity-related costs were
incomplete; total known spend was $2.88378580. No reruns replaced failures.

On same-Luna pairs excluding the capacity-affected b03, both V1 and V2 scored
9/14. V2 cost 3.21% more and took 2.53% longer. No Sol advice, repair or takeover
activated. All five V2 failures passed public checks. b02's grader added a bare
hash requirement beyond the core JSON issue; frozen outcomes were preserved
with that caveat rather than rewritten to improve results.

### Shared-core ablations: 48 attempts

`reports/shared-core-v1/RESULTS.md`: four fresh JS/TS issues, six treatments,
Sol Medium and Luna High strata. **Every arm passed 4/4**, with total cost
$1.13066116. No accuracy benefit was demonstrated.

Output-only increased observed cost by 8.0% on Sol and 15.2% on Luna; output plus
contracts by 16.2%/38.5%; prepared context by 14.7%/66.4%. Most arms were slower.
There were 49 cap notes, 38 large Bash observations, **zero retrieval calls**,
and no activated repairs or soft notices. Deterministic checks themselves were
cheap (2.517 seconds total for sixteen automatic executions), but no rescue was
observed. A notice-arm Sol price reduction could not be credited to notices
that never fired. These optional features earned no production default change.

### Thirty Terminal-Bench tasks × four configurations: 120 slots

`reports/harnesstax-sol61-v1/RESULTS.md`; original V1 source pinned at `526eee4`.
These are 30 tasks, not 120 distinct issues. Dataset commit:
`69671fbaac6d67a7ef0dfec016cc38a64ef7a77c`. Harbor 0.24.0, Pi 1.2.0,
native Codex 0.163.0. One repetition, with authorized infrastructure replacements
making 126 actual executions. Not an exact reproduction of a published
HarnessTax model/repetition configuration.

| Setup | Accepted / 30 slots | Graded | Known cost | Mean seconds |
| --- | ---: | ---: | ---: | ---: |
| Native Codex / Sol High | 23 | 29 | ≥$5.3331712 | 187.0 |
| Pi / Sol High | 27 | 30 | $3.4722872 | 255.5 |
| Original V1 / Sol High | 25 | 30 | ≥$3.324570 | 241.2 |
| V2 / Luna High, selective Sol Low | 18 | 29 | ≥$0.17699946 | 271.0 |

V2 acceptance was **60% of slots**, not the conversational “67%.” It was
18/29 among graded attempts. Cheap spending concealed an unacceptable quality
gap. V1 cost about 4.25% less than Pi in recorded totals but accepted two fewer
tasks; its cost/accepted task was worse. This campaign did not establish that
V1 beats Pi, despite earlier promising cohorts.

V2 had configured public checks on only 3/30 tasks and zero assistance/repair/
takeover activation. The private grader was never an escalation signal.
Codex/V2 tensor-parallel attempts remained ungraded after verifier timeouts.
Permission failures and selected replacements are separately recorded. Known
selected cost was $12.30702786, excluded known floor $0.22305644, total floor
$12.53008430, with incomplete costs retained.

### Five fresh tasks: Pi vs refined V1 vs V2 upfront vs V3

`reports/refinement-pilot-v1/`: 20 attempts, all graded.

| Setup | Accepted | Cost | Mean seconds |
| --- | ---: | ---: | ---: |
| Pi / Sol High | 5/5 | $0.3617668 | 113.1 |
| Refined V1 / Sol High | 5/5 | $0.5284516 | 133.9 |
| V2 / Luna High + upfront Sol Low | 4/5 | $0.06058404 | 123.6 |
| V3 / Sol High coordinator + Luna High | 4/5 | $0.25189196 | 240.2 |

V3 was much slower, substantially more costly than V2, and less accurate than
Pi/refined V1. Its eight delegations were sequential, and the Sol coordinator
accounted for about 84.6% of its cost. It did not validate an efficient Opus-like
orchestrator. The failed polyglot task and public interpreter/invocation mismatch
are preserved. Later public replay passing is not a replacement for original scores.
Total spend was $1.2026944. Advice/repair/takeover activation occurred in this
pilot; dormant escalation in earlier campaigns was not a universal inability
to call Sol. Some aggregate repair counters include different stage types;
stage-level records resolve them.

### Four fresh tasks × eight configurations: calibration

`reports/calibration-v1/`: 32 selected slots, 34 actor attempts including two
excluded interrupted originals, plus grading-only replays.

| Setup | Initial selected acceptance | Selected known cost | Mean seconds |
| --- | ---: | ---: | ---: |
| Pi | 3/4 | $0.5113796 | 193.8 |
| Original V1 | 3/4 | $0.3289360 | 134.7 |
| Refined V1 | 3/4 | $0.6468512 | 230.0 |
| Concise V1 | 3/4 | $0.4192224 | 156.8 |
| Luna alone | 3 accepted, 1 initially ungraded | $0.00999454 | 68.4 |
| V2 upfront | 2 accepted, 1 rejected, 1 ungraded | $0.02005182 | 77.9 |
| V2 selective | 2 accepted, 1 rejected, 1 ungraded | $0.00987298 | 62.4 |
| Concise V2 | 2/4 | $0.00996970 | 73.6 |

Refined V1 nearly doubled original V1 cost and added about 71% latency, without
another pass. Concision was not a dependable cost reduction. Total selected
cost $1.95627824; excluded floor $0.0249576; overall floor $1.98123584 with two
unknown original interruption bills.

One gRPC original explicitly received 503; another interrupted HTML original
was a lost terminal stream, not proven 503. Their specifically authorized
replacements were retained regardless of outcome. The HTML grading environment
had memory/PID pressure from large Chromium/crashpad process populations;
root cause was not proven. Grading-only replays rejected Luna-alone HTML, while
upfront/selective replays timed out again. These did not launch new inference.

Original V1's apparent saving over Pi here was heavily driven by one expensive
failed HTML task. Across the other three, V1 actually cost more than Pi. Four
upfront plans ran; failure-triggered advice, repairs and takeovers did not.
Public checks again failed to expose semantic mistakes.

## Failure diagnosis and the last rejected review prototype

The owner explicitly paused broad feature/benchmark expansion, requested a
saved-trace diagnosis, then authorized one bounded post-implementation review
experiment. `reports/post-review-v1/DIAGNOSIS.md` and `failure-inventory.json`
cover 48 unsuccessful records including eight excluded originals; 47 had worker
receipts. Private grader details were not read for the diagnosis or fed to actors.

Observed categories overlap: verification-gap signals in 32 records; supported
incomplete reasoning/solutions in five; requirements issues in three; tool/scope
signals in five; operational/provider signals in four; grading issues in eleven.
An additional reasoning cause remained explicitly unresolved in 32 graded
records. These are not a clean partition or proof of cognitive root causes.

Examples supported by actor evidence: repository-scope language caused requested
installed system state to be deferred; PDFs went uninspected; image reconstruction
was admitted to miss the public similarity target; Doom produced no frame;
Cython retained an unexcepted failing test; WAL recovery inferred unavailable
rows; public smoke checks passed incomplete solutions. None establishes the
exact private rejection cause beyond the saved evidence.

The post-review strategy used the original task, actual Git diff and new text
files, plus public verification evidence. Sol Low reviewed even after checks
passed, with no tools and no separate context loading. Strict JSON either
approved or provided 1–5 actionable corrections. One Luna High repair was the
maximum; there was no second Sol review. The review had a 48,000-byte input
limit, 8,000-character reply limit, $0.03 allowance and 60-second limit within
the shared budget. Clean initial Git root/unchanged HEAD were required.
Binary files, ignored files, installed services and external state were outside
its supported review scope. Invalid JSON, oversize packets and accounting
problems were explicit failures, not silent approvals.

Files: `src/execution/post-review.mjs`, `src/execution/strategies.mjs`,
`src/pipeline/policy.mjs`, `src/pipeline/executor.mjs`,
`tests/execution-post-review.test.mjs`; design in `reports/post-review-v1/`.
The focused 34 tests passed. A full run then had 164 passes and two known baseline
failures (native multi-package path guard; synthetic retry-idempotency reference
patch exact-match). That was local validation, not proof of model quality.

### Six narrow JS/TS issues × three arms

`reports/post-review-v1/campaign/PRIMARY-RESULTS.md` and `primary-results.json`
are the selected comparison after specifically authorized timeout replacements.
The neighboring `RESULTS.md`/`results.json` retain original attempts.

| Setup | Patch acceptance | Policy-valid accepted | Cost |
| --- | ---: | ---: | ---: |
| Luna High alone | 6/6 | 6/6 | $0.03267364 |
| Luna High + Sol Low review | 6/6 | 5/6 | $0.07056878 |
| Pi / Sol High | 6/6 | 6/6 | $0.95462320 |

These were p-queue #241/#250, ky #878/#879, p-all #15 and eventemitter3 #281,
across four repositories, three in one maintainer ecosystem. The issues were
narrow, reproduced clear requirements, and included declaration-only problems.
Independent checks were authored issue-contract grading, not the official
Terminal-Bench evaluator. Passing six does not establish general capability.

Review cost about 92.6% less than Pi, but roughly 2.16 times Luna-alone cost,
with no additional accepted task. One selected review run produced malformed
JSON and was not a clean policy-valid success despite its accepted patch.

The first three attempts initially had a 600-second cap. Review and Pi timed
out while their patches passed grading. The owner raised remaining attempts
to 1,800 seconds and later explicitly requested one fresh replacement for each
timeout, excluding originals from primary comparison. Original known floors
were $0.01757962 and $0.25152560; those costs remain separately recorded.
The completed Luna-alone first task retained its 600-second allowance (finished
in 325.198 seconds), so the other five issues are the fully matched time-budget
subset. Replacements were not selected based on whether they passed.

### Final diagnostic: five exact old tasks × two new arms

The owner then authorized ten new attempts after the six-issue campaign and
its replacements. No new Pi runs: historical Pi was used as reference only.
This was a deliberately difficult, previously analyzed diagnostic, not held-out
evidence. Selection: three original V2 failures/Pi passes, one shared pass,
one shared failure. All original scores remain unchanged.

| Setup | SQL optimization | G-code interpretation | Image/C | Regex | Git server | Total |
| --- | --- | --- | --- | --- | --- | ---: |
| Historical native Codex / Sol High | Fail | Pass | Pass | Pass | Fail | 3/5 |
| Historical Pi / Sol High | Pass | Pass | Pass | Pass | Fail | 4/5 |
| Historical original V1 / Sol High | Pass | Pass | Pass | Pass | Fail | 4/5 |
| Historical V2 / Luna High, selective Sol | Fail | Fail | Fail | Pass | Fail | 1/5 |
| New Luna alone | Fail | Fail | Fail | Pass | Fail | 1/5 |
| New Luna + Sol review | Fail | Fail | Fail | Pass | Fail | 1/5 |

V3/concise/upfront variants were not run on these exact five tasks.

| New arm | Accepted | Known cost | Mean agent seconds |
| --- | ---: | ---: | ---: |
| Luna alone | 1/5 | $0.02259794 | 163.4038 |
| Luna + Sol review | 1/5 | ≥$0.03638410 | 200.8540 |

This last review experiment delivered **no acceptance improvement**, at least
61% higher cost and about 23% higher mean agent time. Three Sol reviews approved
their patches, including the rejected SQL and G-code results. No Luna repair
activated. Image reconstruction exceeded the review input allowance, so no Sol
call ran there. Git-server usage accounting was inconsistent (18 assistant rows
vs 17 recorded requests); the controller marked cost unknown and stopped before
review. It is not evidence that Sol reviewed and approved that last task.
All ten received graded outcomes, but accounting/review completion was not clean
for every run. “Complete” means ten attempts finished, not ten healthy successes.

The diagnostic gave both arms identical derived images with Git/Python setup
needed for the clean-diff prototype and public checks. Generated binary outputs
were excluded from the review snapshot. Original task instructions and the
original private verifier were retained. These environment/budget adaptations
mean historical Pi costs are not a fresh controlled head-to-head comparison.
Public checks deliberately stated their limited coverage: SQL syntax/plan did
not prove equivalence/performance; G-code output existence did not prove its
answer; image compilation/size/output did not prove visual similarity.

Two no-inference preparation failures occurred first: missing Python, then
Harbor rejecting symlinked verifier directories. They were fixed before paid
attempts. The latter used opaque copies of unchanged original grader files;
their contents were not supplied to actors/reviewers. Both preparation failures
and the original manifests/scripts are retained in WSL state.

Final diagnostic artifacts: `reports/post-review-diagnostic-v1/PLAN.md`,
`queue-plan.json`, `manifest.json`, `RESULTS.md`, `results.json`; scripts in
`benchmark/post-review/diagnostic.py` and `diagnostic-check.py`.
There are no further paid runs queued. The user-requested monitoring heartbeat
`monitor-ten-run-suffice-diagnostic` was paused when all ten finished.

## What the evidence did and did not establish

V1 retained real value as a functioning single-model CLI. It matched historical
Pi 4/5 on these exact final diagnostic tasks and achieved the earlier 40.57%
recorded cost reduction versus Codex on the fifteen-issue Sol Medium cohort.
It did not establish universal superiority over Pi: the 30-task comparison was
25/30 versus Pi 27/30 at similar total spending, with worse recorded cost per
accepted task for V1.

The owner regards V2/V3 as failed directions. The strongest negative evidence
is the broader V2 quality gap, the non-rescuing final 1/5 review diagnostic,
V3's costly slow coordination, and repeated refined-V1/concision regressions.
The small 3/3 or 6/6 pilots were too narrow to counter that conclusion.

Cheap workers explain much of the headline savings. Neither a small prompt nor
a large hook bundle was shown to produce the friend's claimed reliability in
Suffice. More concise language was not equivalent to less total work. More
prepared context often increased costs. Output caps activated but retrieval
never did in the 48-arm ablation, so its recovery advantage was locally tested,
not demonstrated as a live benchmark benefit. Review could not inspect missing
evidence, exceed its byte allowance, or repair merely by approving a patch.

There is no established finding here about Opus/Haiku matching Sol/Luna, Astra
being necessary/unnecessary, ideal compaction thresholds, cache retention under
graph traversal, or the transferability of the friend's optimizations. Those
were discussion topics, not verified results. The friend supplies their own
optimization context separately.

## Evidence locations and portability

The earlier long narrative `reports/CHATGPT-HANDOFF-2026-10-20.md` covers the
120-slot campaign through calibration in more detail, including per-task costs,
replacements, grading replays and unresolved questions. It predates the final
post-review experiments; this document includes those later outcomes and the
owner's newer rejection of V2/V3. Historical report recommendations are historical
and do not override the owner's current V1-only baseline decision.

For campaign manifests, source hashes, metrics, caveats and raw report tables:

- `reports/pipeline-bench-v1/`, `reports/effort-bench-v1/`.
- Medium branch `reports/accuracy-bench-v1/` and implementation report.
- `reports/broad-bench-v1/`, `reports/shared-core-v1/`.
- `reports/harnesstax-sol61-v1/`, `reports/refinement-pilot-v1/`,
  `reports/calibration-v1/`.
- `reports/post-review-v1/` and its `campaign/PRIMARY-RESULTS.md`.
- `reports/post-review-diagnostic-v1/`.
- Separate `suffice-experiments` snapshots, especially
  `field-campaign-v1/{experiments,reports,research}/` and its completion reports.

Full private actor/runtime receipts on Sonion are primarily in WSL Ubuntu:

- `/home/eric_qin/suffice-harnesstax-sol61`
- `/home/eric_qin/suffice-refinement-pilot`
- `/home/eric_qin/suffice-calibration-v1`
- `/home/eric_qin/suffice-post-review-v1`
- `/home/eric_qin/suffice-post-review-diagnostic-v1`
- Older `/home/eric_qin/suffice-broad-v1`, `suffice-field-v1`,
  `suffice-general-runtime`, and `suffice-codex-runtime-0163` remain preserved.

Windows `.suffice/broad-bench-v1` contains the copied filtered 4,180 benchmark
receipt files (88,050,118 bytes), with export/copy verification manifests.
Raw runtime caches, authentication, installed dependencies, full actor workspaces
and some logs are ignored/private and are **not all in GitHub**. No credentials
were intentionally committed or transferred. Suffice-experiments includes
evaluator/reference material and must not be mistaken for actor-safe context.

This handoff ends with the owner's boundary: the project history and rejected
experiments are available for understanding, while **the original V1 alpha is
the baseline**. The friend's own explanation supplies any future direction.
