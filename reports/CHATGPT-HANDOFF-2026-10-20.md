# Suffice: complete ChatGPT update from the 120-attempt benchmark through calibration

Prepared October 20, 2026, from saved benchmark reports and receipts on Sonion.
This document is intended to be uploaded or pasted into the existing ChatGPT conversation.
It covers completed work, unsuccessful experiments, accounting corrections, unresolved
grading problems, and the proposed next step. Proposed work is explicitly identified.

## 1. Where we are now

We initially saw exciting savings on tiny cohorts, then ran a larger comparison.
The larger run did **not** establish that Suffice V1 beats Pi: Pi accepted more
tasks at a similar recorded total cost. V2 was much cheaper but accepted fewer tasks.
Subsequent experiments have not yet solved that quality gap.

The current recommendation is to retain original V1 as the stable reference and
keep V2 experimental. Refined V1 and concise instructions have not earned promotion.
Luna-alone is a promising cheap V2 control, but four tasks cannot establish its
general accuracy. Selective assistance is limited by weak observable verification.

The user's latest concern is that V1's claimed advantage weakened with broader
testing, while V2's low price comes with unsatisfactory acceptance. We agreed the
next useful step is failure diagnosis, followed by one focused review experiment,
instead of another large matrix of loosely motivated optimizations.

**Numerical correction:** the 30-task V2 result was **18/30 = 60%** accepted over
all slots, or 18/29 = 62.1% among officially graded attempts. The conversational
reference to “67% accuracy” is not that campaign's final score. Later V2 configurations
scored 4/5, 3/4, or 2/4 on different small cohorts. Do not combine these into one score.

## 2. Modes and what the names mean

Suffice uses the Pi coding-agent runtime with its existing codemode interface,
AST navigation, caching, and repository tooling. These remained part of the
Suffice controls; we did not replace them with Claude Code's tool interface.

| Name | Execution policy |
| --- | --- |
| Original V1 / Flexible | Original single-model Suffice behavior. Can support available models/efforts; benchmark controls used GPT-6.1-Sol High. |
| Refined V1 | Experimental explicit isolated-task scope guidance and a same-model repair after an observed public-check failure. |
| V2 / Efficient | Luna implementation over the efficient core: recoverable output control, prepared context, compact guidance/notices, public verification, and configurable Sol assistance. The exact assistance policy varies by campaign. |
| V3 / Orchestrated | Experimental Sol coordinator that delegates implementation/investigation to Luna. Sol has no general shell or editing tools. |

The model names used here are GPT-6.1-Sol and GPT-6-Luna. Sol advice/takeover used
Low effort in the V2 experiments; Luna workers used High. V3's coordinator used
Sol High. Astra was not tested. Configurable “Auto” and user-selected worker/advisor
models were discussed as product directions, not established benchmark findings.

V2 is a branch/policy of the same Suffice repository, not a separate product.
Production defaults have not been switched to the experimental strategies.

## 3. How to read every result below

- All dollar amounts are **API-equivalent estimates**, not subscription charges or a conversion to Codex plan usage.
- Failure costs count in comparison totals and cost per accepted task. Missing accounting remains unknown; known sums with unknown records are floors.
- “Accepted” means independent official grading accepted the result. Public self-checks are a separate, partial signal.
- “Ungraded” means no usable official verdict, commonly a verifier timeout. It is not a demonstrated patch rejection.
- Agent time includes the full recorded agent phase, including orchestration. It excludes environment setup and independent grading. One old Pi outer timing is missing.
- Official grading runs after the actor exits. Its private cases, solutions, and feedback were never supplied to actors, advisors, routing, or repairs.
- Each cohort used one attempt per task/arm. Later authorized infrastructure replacements were predeclared and selected regardless of their outcomes; this was not retry-until-pass.
- Fresh tasks differed between the 30-task campaign, five-task pilot, and four-task calibration. Small-cohort changes do not establish population accuracy.
- V2 versus Sol controls changes the model and pipeline together. It does not isolate a harness-only saving.

## 4. Round A: the 120-slot HarnessTax-style comparison

We ran **30 Terminal-Bench 2 tasks × four configurations**, one repetition:
native Codex 0.163.0, stock Pi 1.2.0, original Suffice V1, and existing Suffice V2.
Codex, Pi, and V1 all used **GPT-6.1-Sol High**. V2 used **Luna High** with
conditional **Sol Low** assistance. This adapted the public HarnessTax task cohort;
it was not a reproduction of the published model/version/repetition setup.

The task dataset was pinned to `69671fbaac6d67a7ef0dfec016cc38a64ef7a77c`,
using Harbor 0.24.0. The public HarnessTax cohort reference was pinned to website
commit `6e6a648a070012c509be584f4013f7786fe3559d`.

| Configuration | Accepted / slots | Officially graded | Ungraded | Known total USD | Incomplete cost records | Mean agent seconds |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Native Codex · Sol High | 23/30 | 29 | 1 | 5.333171 | 1 | 187.0 |
| Pi · Sol High | 27/30 | 30 | 0 | 3.472287 | 0 | 255.5 |
| Original V1 · Sol High | 25/30 | 30 | 0 | 3.324570 | 1 | 241.2 |
| V2 · Luna High + selective Sol Low | 18/30 | 29 | 1 | 0.176999 | 1 | 271.0 |

Accepted-slot rates were 76.7%, 90.0%, 83.3%, and 60.0%, respectively. The two
ungraded attempts were `torch-tensor-parallelism` for Codex and V2, both verifier
timeouts. Other failures include operational failures and cannot all be attributed
to incorrect code.

Using recorded totals, V1 cost about **4.25% less than Pi**, with two fewer accepted
tasks. Recorded cost per accepted task was about **$0.1330 for V1 versus $0.1286
for Pi**; the V1 amount is a floor because one cost is incomplete. This larger
run therefore did not demonstrate V1 superiority over Pi.

V2's recorded total was about 94.9% below Pi and 96.7% below Codex, but acceptance
was lower and its average agent phase was longer. These percentages compare
incomplete recorded totals and different models, so they are not guaranteed savings.

### Infrastructure and accounting work during this round

- The user allowed a common 100-response cap, 240-tool ceiling, and $5 whole-attempt cost guard. Original task time/resource limits remained. The first provider-failed Codex attempt had the initial 60-response cap but made zero model responses.
- Concurrency rose from one to at most two, with a combined 4 GiB task reservation; larger tasks ran alone. Existing unrelated Sonion containers were preserved.
- After attempt 55, receipts were bind-mounted to survive outer timeouts. Actors were stopped before grading after timeout cancellation.
- A receipt permissions failure prevented grading six V1/V2 attempts. The adapter was fixed to read receipts as root before host cleanup; the user authorized exactly six fresh replacements.
- The original six attempts remain in an audit trail. The selected comparison has 120 slots, but **126 actor executions** occurred.
- The Pi adaptive-rejection-sampler result was recovered after a host interruption during artifact collection. Its actor and grader were not rerun; outer agent timing is missing.
- An accounting bug used `splitlines()` on JSONL containing legal Unicode line separators inside strings. Offline reconciliation with literal newline splitting recovered all eight financial-document-processor V1 responses: **$0.186490**. This changed accounting completeness, not code or grades.
- Codex adaptive-rejection-sampler failed in routing discovery with no recorded model responses; its cost is not confirmed zero. V1 make-doom-for-mips lost receipts on an early timeout. V2 also retains an incomplete cost record.
- Selected known comparison cost: **$12.30702786**. Excluded infrastructure originals: **$0.22305644** known. Total known spend including originals: **at least $12.53008430**, with three incomplete cost records across selected/excluded accounting.

### Why Sol did not activate

There were **zero advice calls, zero repairs, and zero takeovers** in this campaign.
Controller smoke checks covered only **3/30 tasks**. Other tasks had no controller
verification trigger. Where visible checks passed, independent failures discovered
later could not activate assistance retroactively.

This is not proof that Sol was unnecessary. It exposed limited verification
coverage and trigger design. The subsequent pilot demonstrated that the assistance
path can actually execute.

Source report: `reports/harnesstax-sol61-v1/RESULTS.md` and `results.json`.

## 5. Diagnosis and implementation after the larger run

We inspected actor traces and found a concrete scope mismatch: V1's nginx answer
deferred a requested system installation because of repository restrictions and
presented a temporary installation. A tensor trace also showed a rejected `/tmp`
write followed by a shell workaround, although that friction was not established
as the cause of the task failure.

We added opt-in scope guidance for explicitly isolated task environments. This
guidance does not relax file guards or create an OS security boundary. Existing
shell behavior handles explicitly authorized operations outside the repository.

We added explicit public verification evidence and bounded same-model repair,
and tested upfront task-only Sol advice to avoid duplicate repository preparation.
Recoverable output retrieval preserves original bytes and supports bounded ranges,
including binary recovery, instead of relying only on model-written summaries.

At the user's request we also built V3. Sol can read/navigate, access fixed public
verification evidence, retrieve retained worker output, and delegate. Luna handles
implementation or focused investigation. At most four sequential delegations share
the task budget and workspace. Sol cannot edit files or run arbitrary shell commands.
Workers receive the original task and a concise brief, not the entire parent history.

We did **not** add a paid Luna interception to every tool call. Deterministic tool
execution and exact output retrieval remain cheaper paths. No compaction treatment
was enabled, and there is no measured compaction/cache benefit from these runs.

## 6. Round B: five fresh tasks, including V3 — 20 attempts

The user expanded the planned 15-attempt comparison to **20** by adding V3.
Pi used Sol High. V1 here means **refined V1**, not the unchanged baseline.
V2 used Luna High plus one upfront Sol Low plan, a possible Luna repair, then
conditional Sol Low takeover. V3 used Sol High coordination and Luna High workers.

All arms received the original task and identical visible partial public-check
command. Pi could use the check itself; Suffice's controller could feed a failure
into the declared repair policy. Those are treatment differences.

| Configuration | Accepted | Known total USD | USD per accepted, including failures | Mean agent seconds |
| --- | ---: | ---: | ---: | ---: |
| Pi · Sol High | 5/5 | 0.361767 | 0.072353 | 113.1 |
| Refined V1 · Sol High | 5/5 | 0.528452 | 0.105690 | 133.9 |
| V2 · upfront advice | 4/5 | 0.060584 | 0.015146 | 123.6 |
| V3 · Sol coordinator / Luna workers | 4/5 | 0.251892 | 0.062973 | 240.2 |

All 20 were graded, with complete accounting and no outcome replacements. Total:
**$1.20269440**. Pi and V1 passed all five. V2 and V3 failed `polyglot-c-py`;
all four passed cancel-async-tasks, cobol-modernization, custom-memory-heap-crash,
and modernize-scientific-stack.

Compared with Pi, refined V1 cost 46.1% more and took 18.4% longer. V2 cost
83.3% less in total, or 79.1% less per accepted task, and took 9.3% longer.
V3 cost 30.4% less in total, or 13.0% less per accepted task, and took 112.3% longer.

### What activated and what it cost

- Refined V1: one repair.
- V2: five upfront Sol plans, one Luna repair, and **one actual Sol takeover**.
- V3: eight delegations and two recorded repair events. Delegations were sequential; extra COBOL rounds and a polyglot investigation increased elapsed time.
- V2 model-stage cost: Sol **$0.036626**, Luna **$0.023958**.
- V3 model-stage cost: Sol **$0.213160**, Luna **$0.038732**. Sol accounted for **84.6%** of V3 cost.
- V3 coordinator context peaked at **22,801 input tokens**. This did not test the friend's claimed 30k/100k compaction behavior.

The takeover proves the execution path can activate. It did not rescue the failed
polyglot result. This pilot lacked a Luna-alone control, so it could not establish
the incremental value of upfront advice.

### Verification and permission findings

The polyglot task image lacked default system `python3`. A portable interpreter
was mounted for the public checker launcher, but the candidate command still
invoked system Python. The check therefore mixed environment readiness with
candidate correctness. Pi was independently accepted despite this public failure.

V1 spent **$0.031034** on a repair triggered by the missing-interpreter diagnostic.
V2's repair and takeover did not resolve the same controller invocation issue.
V3's read-only investigation worker could not read the checker outside its file
scope and had no shell fallback. Another model call cannot resolve that permission
mismatch by itself; permitted evidence access needs explicit handling.

We subsequently reconstructed all four polyglot source artifacts from actor
receipts and replayed public Fibonacci cases without inference. **All four compiled
and passed 38 cases in C and the explicitly mounted Python**, including 0..30,
50, 92, 93, 100, 1000, 10000, and 21000.

That replay did not establish official correctness or reverse the failures.
V1 installed a persistent system Python symlink; V2 used command-local PATH changes,
and V3 left the prerequisite unresolved. Pi also used a local PATH change and
was accepted, so missing Python alone does not explain the official difference.
The exact independent rejection cause remains unresolved.

Supported conclusion: unavailable checker prerequisites should be classified
as unverified evidence, rather than automatically triggering paid code repair.
Actual task-required installations still count as candidate behavior.

Sources: `reports/refinement-pilot-v1/{RESULTS,ASSESSMENT,FINDINGS,VALIDATION}.md`,
`reports/calibration-v1/ARTIFACT-AUDIT.md`, and its saved public replay.

## 7. Changes before the next calibration

We separated unavailable verification prerequisites from observed candidate
failures. Mixed evidence is handled explicitly. We also added optional concise
communication instructions without changing model effort, token budgets, or tools.

The concise treatment asks for shorter communication. It does not cap reasoning
or tool arguments. We measured visible text separately from billed output.

Focused pipeline/strategy/orchestration checks passed **27 tests**. The full
Windows suite had **157 passing and two pre-existing failures**: native multi-package
file scope and synthetic reference-patch exact matching. These were not claimed fixed.
Earlier pilot validation had 153 passing and those same two failures.

The final calibration integrity audit passed for all 32 selected slots, model
identities, original/replacement receipt hashes, stage-cost reconciliation,
53 frozen runtime inputs, 42 baseline inputs, two public inputs, and four task
contracts. It correctly preserves the three original ungraded records; later
HTML replay verdicts are separate evidence.

Prepared context, output control, guidance, and notices remained constant within
the V2 assistance comparisons. This calibration did not isolate each one's value.
We did not globally load skills or blindly install Claude-specific hooks.

## 8. Round C: four fresh tasks × eight configurations — 32 slots

Tasks were log-summary-date-ranges, kv-store-grpc, filter-js-from-html, and
db-wal-recovery. All were excluded from the earlier cohorts. Each arm saw the same
original task and public check. Checks used the task's existing system Python.

| Arm | Exact treatment |
| --- | --- |
| Pi | Stock Pi 1.2.0, Sol High. |
| V1 original | Original Flexible source pinned at `526eee4`, enhancements off. |
| V1 refined | Sol High, isolated-task guidance, one public-failure repair. |
| V1 concise | Refined V1 plus concise communication instructions. |
| V2 alone | Luna High, efficient core, one possible Luna repair, no Sol. |
| V2 upfront | Luna High, upfront Sol Low plan, possible Luna repair and conditional Sol Low takeover. |
| V2 selective | Same assistance/takeover structure, with Sol advice triggered by observed public failure. |
| V2 concise | Selective V2 plus concise instructions for worker/advisor. |

### Final campaign table with separately labeled replay evidence

The original frozen campaign has three HTML entries marked ungraded. A later
grading-only replay rejected Luna-alone; the other two replay graders timed out
again. This table incorporates that additional evidence in a labeled presentation;
the original campaign JSON and verdicts were not overwritten.

| Arm | Accepted | Rejected/failed slots | Still ungraded | Total USD | Mean agent seconds |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pi · Sol High | 3/4 | 1 | 0 | 0.511380 | 193.8 |
| Original V1 · Sol High | 3/4 | 1 | 0 | 0.328936 | 134.7 |
| Refined V1 · Sol High | 3/4 | 1 | 0 | 0.646851 | 230.0 |
| Concise V1 · Sol High | 3/4 | 1 | 0 | 0.419222 | 156.8 |
| V2 · Luna alone | 3/4 | 1 via later artifact replay | 0 after replay | 0.009995 | 68.4 |
| V2 · upfront Sol advice | 2/4 | 1 | 1 | 0.020052 | 77.9 |
| V2 · selective Sol advice | 2/4 | 1 | 1 | 0.009873 | 62.4 |
| Concise V2 · selective | 2/4 | 2 | 0 | 0.009970 | 73.6 |

All costs for these selected 32 slots are fully accounted. Selected comparison
spend: **$1.95627824**. The two excluded provider originals add **$0.02495760**
known spend, with incomplete usage. Total incurred known floor: **$1.98123584**.

### What these comparisons show

Original V1 was **35.68% cheaper and 30.51% faster than Pi** over these four
tasks, with the same accepted outcomes. It used the unchanged original harness,
not the new refined treatment.

However, **one HTML task drove the aggregate cost advantage**:

| Cost across tasks | Pi | Original V1 |
| --- | ---: | ---: |
| HTML task; both failed | $0.428056 | $0.234408 |
| Other three tasks; both passed all three | $0.083324 | $0.094528 |

V1 was about **13.45% more expensive across the other three**. The latest result
does not demonstrate a uniform 35.7% harness saving. Different tasks, generated
solutions, and execution paths changed the totals. This reconciles the result
with the much closer costs in the previous 30-task campaign.

Refined V1 cost **96.65% more than original V1**, took **70.78% longer**, and
accepted the same tasks. Concise V1 was cheaper than refined V1 but remained
more expensive and slower than original V1, without an acceptance gain.

Luna-alone matched 3/4 acceptance at approximately **98.05% less total cost than
Pi**. This is encouraging diagnostic evidence, but changes model and pipeline,
has only four tasks, and relies on the separately reported artifact replay for
the HTML rejection.

Upfront advice cost about twice Luna-alone and showed a WAL-recovery regression.
Selective advice had a gRPC regression. The HTML outcomes remain unknown for
both assisted variants. Neither variant has demonstrated an accuracy benefit.

### Conciseness did not mean less expensive reasoning

| Arm | Output tokens | Visible communication characters |
| --- | ---: | ---: |
| Pi | 27,997 | 2,431 |
| Original V1 | 20,285 | 2,993 |
| Refined V1 | 35,896 | 3,588 |
| Concise V1 | 24,207 | 2,532 |
| V2 alone | 8,965 | 966 |
| V2 upfront | 9,616 | 4,242 |
| V2 selective | 8,207 | 956 |
| V2 concise | 9,183 | 1,162 |

Concise V1's HTML attempt alone cost **$0.3232996**, with 12 responses, 24 tool
calls, 20,374 output tokens including 11,225 recorded reasoning tokens, and only
815 visible communication characters. Its agent phase was about 463 seconds
(7.7 minutes). The earlier conversational estimate of 8.8 minutes was inaccurate.

Brief visible messages do not ensure short reasoning, fewer tool calls, or fewer
generated code tokens. Concise V2 accepted 2/4; it fixed selective V2's gRPC result
but regressed on WAL recovery. There is no observed accuracy improvement overall.

### Assistance activation

The calibration recorded **four upfront Sol plans**, and **zero failure-triggered
advice calls, zero controller repairs, and zero takeovers**. Visible checks passed
even on independently rejected patches. Therefore absence of selective escalation
reflects insufficient observable coverage, not proof that no help was needed.

The earlier pilot's takeover remains evidence that activation can work. These
calibration runs do not establish the benefit of selective assistance because its
paid path never executed.

### Provider interruptions and exactly two replacements

The user authorized fresh attempts for two interrupted refined-V1 slots and asked
that the original interrupted costs be excluded from the main comparison. We
predeclared those two replacements and kept their original costs in incurred-spend
accounting. No other failed coding result was replaced.

- Original gRPC refined V1: HTTP **503**, `subscription_sharing_user_unavailable`, followed by cancellation; recorded floor **$0.0151700**.
- Original HTML refined V1: stream ended without a terminal response event; **no HTTP 503 recorded**; floor **$0.0097876**. Provider/proxy/network root cause is unresolved.
- Fresh gRPC replacement: **accepted**, **$0.032324**, about **61.1 agent seconds**.
- Fresh HTML replacement: **rejected**, **$0.5395824**, with complete model accounting and no provider interruption.

The comparison remains 32 slots; **34 actor executions** occurred. Both replacement
outcomes fill their slots regardless of result. Concurrency was reduced for
pending jobs after an interruption; that does not establish concurrency as its cause.

## 9. Why grading took so long, and what we changed

Three original HTML Luna actors completed model work in roughly two minutes,
then each official grader reached the existing **900-second timeout**. A later
HTML grading container showed its **2 GiB memory limit reached**, an OOMKilled
flag, about **240 Chromium processes plus 54 chrome_crashpad processes**, and
roughly **2,998 PIDs including threads**.

We inspected resource/process metadata rather than private cases. Resource
exhaustion is suggested; the underlying cause remains unknown. Candidate behavior,
browser cleanup, and grader/environment behavior were not disentangled.

The original scheduler held admission slots through model execution, grading,
and cleanup. We added an admission scheduler allowing at most **two active model
jobs and four total task containers**, releasing model slots only after terminal
known-cost receipts. It adopted live jobs and retained memory/quota/spend guards.
This let new coding jobs proceed while old jobs graded. It improved queue throughput;
it did not prove an individual grader became faster. Mixed scheduling limits
causal interpretation of latency comparisons.

The user then authorized one **grading-only replay** for each original ungraded
HTML artifact. We reconstructed final filter.py files from successful recorded
mutations, skipped failed edits, and included upfront's final shell replacements.
Selective matched its recorded final full-file readback. All sources compiled.
No independent original filesystem hash exists for the other two, so these are
receipt-based reconstructions, not full original filesystem snapshots.

The replay restored and hash-checked each source in a fresh original task container
with unchanged CPU/memory limits and grading timeout. No models or credentials
were mounted. Alone ran first; at the user's request, upfront and selective then
graded concurrently.

| Saved artifact | Additional replay verdict |
| --- | --- |
| Luna-alone HTML | Rejected, reward 0, no grading exception. |
| Upfront-advice HTML | VerifierTimeoutError; still ungraded. |
| Selective-advice HTML | VerifierTimeoutError; still ungraded. |

These three replays added **zero model inference cost**. Original results were
preserved and replay verdicts recorded separately. No further attempts are running
as part of these completed campaigns, and no further reruns were authorized here.

## 10. Findings we should keep, and claims we should retire

Supported findings:

1. Luna's low price is real in the recorded model accounting. It creates room to test selective spending on quality, but the current system has not met our reliability goal.
2. Original V1 can beat Pi on some tasks/cohorts, but the 30-task result did not establish an overall advantage. The four-task advantage was concentrated in one failed task.
3. Refined V1 and concise prompting have not demonstrated improvements sufficient to replace original V1.
4. V3 can enforce a coordinator/worker split, but its Sol coordination cost and sequential rounds made it slow without improving acceptance in the five-task pilot.
5. Public verification coverage is the central unresolved weakness in failure-triggered escalation. A smoke-test pass cannot be treated as a correctness certificate.
6. Missing checker prerequisites can cause paid repair without evidence of a code defect. Required product state and optional checker infrastructure need separate treatment.
7. Prepared context, recoverable output control, guidance, and advisory notices were bundled in these V2 comparisons. Their individual causal effects are not established by these rounds.

Claims to avoid:

- “Suffice is universally 95–98% cheaper at equal quality.” Different models and lower acceptance explain much of the apparent saving.
- “No escalation means Luna did not need help.” Public checks missed defects.
- “Concise messages necessarily reduce total billed output.” Reasoning and tool/code generation can dominate.
- “The friend's 97% Claude result transfers to Suffice.” We did not reproduce that configuration, task distribution, or evaluation.
- “The grading timeouts prove the candidate failed.” Those two verdicts are still unknown.
- “V1 is onto nothing” as a demonstrated universal conclusion. The evidence is narrower: it has not established the broad competitive advantage we hoped for.

The early three-task savings and previous 15-issue figures are separate historical
cohorts. They are outside this update's requested starting point and must not be
substituted for these later matched comparisons.

## 11. Proposed next experiment — discussed, not implemented or benchmarked

The latest recommendation was to pause broad benchmarking and first classify
existing actor failures: misunderstood requirements, incomplete implementation,
weak testing, tool/scope friction, provider problems, and grading problems.
Use actor traces and public contracts without giving hidden evaluation feedback
to new actors or encoding private failure signatures into the harness.

Then test one focused V2 change: **Luna implements; Sol reviews the issue, actual
diff, and visible verification evidence even when smoke checks pass**. Sol accepts
or gives a concrete correction for Luna. This provides code/evidence to the reviewer
and removes sole dependence on a failed smoke check as the trigger.

Compare on fresh held-out tasks: Luna-alone, Luna plus post-implementation Sol
review, and Pi/Sol. Freeze a shared spending limit and success criterion in advance.
Include every review/repair dollar and failure. This review strategy could still
miss defects or erase savings; it is a hypothesis awaiting a test.

No such post-implementation review campaign has been run. It should not be
confused with already-tested upfront advice or V3 orchestration.

## 12. Repository, source, and handoff state

- Windows harness repository: `C:\Users\Eric Qin\Documents\GitHub\suffice`.
- Separate experiments repository: `C:\Users\Eric Qin\Documents\GitHub\suffice-experiments`.
- Active work branch: `codex/suffice-refinement-pilot`, based on original campaign baseline `526eee4`.
- Latest pushed commit before writing this handoff: `972d305` (completed HTML replay outcomes).
- The `packages/cli/src` production harness was preserved through this experimental series; new policies are opt-in in the experimental execution code.
- Main experimental implementation: `src/execution/{core,strategies,verification,check-evidence,scope,orchestrated,entry}.mjs`.
- WSL campaign environments remain under `/home/eric_qin/`; the calibration state is `/home/eric_qin/suffice-calibration-v1`.
- Full receipts, frozen manifests, hashes, task/resource pins, replacement plans, and model-stage costs remain saved. Unknown costs are retained.
- Mohammed's machine is offline. Changes are committed/pushed for a later pull; live synchronization has not been claimed.

Detailed local sources:

- `reports/harnesstax-sol61-v1/RESULTS.md`, `results.json`, accounting and replacement audits.
- `reports/refinement-pilot-v1/RESULTS.md`, `ASSESSMENT.md`, `FINDINGS.md`, `VALIDATION.md`, activation/completion audits.
- `reports/calibration-v1/RESULTS.md`, `ANALYSIS.md`, `results.json`, `communication-metrics.json`.
- `reports/calibration-v1/ARTIFACT-AUDIT.md`, `GRADING-SCHEDULING.md`, `PROVIDER-REPLACEMENTS.md`, `GRADING-REPLAYS.md`.
- `reports/calibration-v1/grading-replays/html-r1/outcomes.json` and source provenance.
- `benchmark/harnesstax-plan.md`, `refinement-plan.md`, `calibration-plan.md`, `calibration-arms.mjs`.

The appendices below are generated directly from the saved comparison JSON files.
They retain the original campaign grades; the separate HTML replay evidence above
is intentionally not substituted into those original records.

## Appendix A. Every original selected task outcome, cost, and agent time

Each cell is **verdict / whole-attempt USD / agent seconds**. `U` means ungraded;
`F` means an officially graded non-accepted result and can include an operational
failure. `P` means accepted. A `>=` cost is a known floor with incomplete accounting.
A dash means that timing was not recorded. All selected replacements are included
in their original comparison slots; excluded originals are listed separately below.

### Round A: harnesstax-sol61-v1

| Task | codex | pi | v1 | v2 |
| --- | --- | --- | --- | --- |
| adaptive-rejection-sampler | F / >=$0.000000 / 24.3s | P / $0.225686 / - | P / $0.296030 / 480.1s | P / $0.007832 / 360.2s |
| build-cython-ext | P / $0.293906 / 232.7s | P / $0.248870 / 351.8s | P / $0.189862 / 333.6s | F / $0.013041 / 449.0s |
| build-pmars | P / $0.139174 / 119.0s | P / $0.131654 / 269.5s | P / $0.130438 / 157.5s | P / $0.005189 / 292.2s |
| code-from-image | P / $0.022044 / 15.7s | P / $0.009428 / 15.7s | P / $0.012841 / 18.6s | P / $0.000751 / 22.9s |
| compile-compcert | P / $0.578215 / 742.1s | P / $0.302484 / 1094.7s | P / $0.293701 / 679.8s | P / $0.007825 / 441.7s |
| configure-git-webserver | F / $0.091522 / 96.3s | F / $0.051087 / 77.6s | F / $0.105164 / 161.4s | F / $0.003620 / 90.7s |
| constraints-scheduling | P / $0.063270 / 55.5s | P / $0.032570 / 48.2s | P / $0.053120 / 67.2s | P / $0.002357 / 53.1s |
| feal-linear-cryptanalysis | P / $0.099175 / 118.5s | P / $0.071966 / 113.2s | P / $0.165905 / 257.9s | P / $0.005596 / 192.3s |
| financial-document-processor | P / $0.155700 / 80.1s | P / $0.114428 / 152.1s | P / $0.186490 / 131.5s | F / $0.014371 / 230.3s |
| fix-code-vulnerability | P / $0.155324 / 42.4s | P / $0.068692 / 55.2s | P / $0.052376 / 38.2s | P / $0.006783 / 125.5s |
| fix-git | P / $0.049206 / 32.7s | P / $0.039905 / 48.0s | P / $0.027799 / 34.9s | P / $0.006758 / 91.6s |
| gcode-to-text | P / $0.135172 / 95.7s | P / $0.045723 / 55.9s | P / $0.063382 / 79.5s | F / $0.005995 / 127.7s |
| headless-terminal | P / $0.112957 / 152.4s | P / $0.078350 / 124.8s | P / $0.087305 / 138.2s | P / $0.004514 / 133.8s |
| make-doom-for-mips | F / $0.684118 / 537.5s | F / $0.454822 / 890.7s | F / >=$0.000000 / 900.0s | F / $0.019618 / 332.5s |
| merge-diff-arc-agi-task | P / $0.116308 / 88.3s | P / $0.060204 / 73.0s | P / $0.069405 / 105.1s | P / $0.006524 / 169.0s |
| multi-source-data-merger | P / $0.050962 / 59.8s | P / $0.036774 / 59.8s | P / $0.061494 / 110.4s | P / $0.002549 / 78.3s |
| nginx-request-logging | P / $0.061715 / 75.6s | P / $0.036088 / 54.6s | F / $0.097010 / 183.3s | P / $0.003119 / 102.6s |
| openssl-selfsigned-cert | P / $0.039698 / 57.9s | P / $0.035482 / 55.8s | P / $0.039938 / 61.7s | P / $0.002563 / 71.1s |
| path-tracing | P / $0.223419 / 295.4s | P / $0.385588 / 613.6s | P / $0.153089 / 266.9s | F / $0.008711 / 378.5s |
| path-tracing-reverse | P / $0.179130 / 83.8s | P / $0.103944 / 64.7s | P / $0.107729 / 75.4s | F / $0.004404 / 162.3s |
| pypi-server | P / $0.079494 / 84.4s | P / $0.044406 / 60.4s | P / $0.043379 / 70.9s | P / $0.001711 / 64.2s |
| query-optimize | F / $0.267070 / 288.4s | P / $0.063317 / 293.3s | P / $0.045314 / 68.1s | F / $0.002915 / 267.9s |
| regex-log | P / $0.093602 / 105.6s | P / $0.026075 / 47.1s | P / $0.055372 / 94.9s | P / $0.002267 / 61.3s |
| reshard-c4-data | P / $0.240791 / 380.4s | P / $0.131133 / 295.9s | P / $0.117933 / 240.5s | P / $0.003782 / 181.3s |
| sam-cell-seg | F / $0.361286 / 447.7s | F / $0.231507 / 574.6s | F / $0.262400 / 632.7s | F / $0.004192 / 116.5s |
| sparql-university | P / $0.067896 / 61.4s | P / $0.034592 / 41.8s | P / $0.056939 / 68.6s | P / $0.004033 / 87.5s |
| sqlite-db-truncate | P / $0.055220 / 38.0s | P / $0.053201 / 33.5s | P / $0.065980 / 41.3s | P / $0.002210 / 62.4s |
| torch-tensor-parallelism | U / $0.186671 / 149.3s | P / $0.037960 / 72.6s | F / $0.085151 / 239.1s | U / $0.003496 / 82.7s |
| train-fasttext | P / $0.529086 / 850.1s | P / $0.130220 / 1465.8s | P / $0.197248 / 1230.2s | F / $0.014832 / 3150.6s |
| video-processing | F / $0.201039 / 198.7s | P / $0.186129 / 304.9s | P / $0.201776 / 268.8s | F / >=$0.005443 / 149.5s |

### Round B: refinement-pilot-v1

| Task | pi | v1 | v2 | v3 |
| --- | --- | --- | --- | --- |
| cancel-async-tasks | P / $0.037308 / 69.3s | P / $0.033544 / 57.1s | P / $0.004454 / 56.7s | P / $0.030458 / 220.0s |
| cobol-modernization | P / $0.169888 / 260.3s | P / $0.311720 / 357.0s | P / $0.007433 / 114.9s | P / $0.091226 / 512.1s |
| custom-memory-heap-crash | P / $0.060365 / 86.4s | P / $0.060588 / 82.6s | P / $0.010598 / 181.8s | P / $0.069607 / 186.5s |
| modernize-scientific-stack | P / $0.030877 / 45.1s | P / $0.032219 / 27.3s | P / $0.004234 / 30.0s | P / $0.022981 / 49.8s |
| polyglot-c-py | P / $0.063328 / 104.6s | P / $0.090380 / 145.7s | F / $0.033866 / 234.7s | F / $0.037620 / 232.5s |

### Round C: calibration-v1

| Task | pi | v1-original | v1-refined | v1-concise | v2-alone | v2-upfront | v2-selective | v2-concise |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| db-wal-recovery | P / $0.021205 / 34.4s | P / $0.031318 / 37.9s | P / $0.035048 / 44.1s | P / $0.038264 / 37.6s | P / $0.001240 / 32.1s | F / $0.004630 / 80.1s | P / $0.001296 / 28.4s | F / $0.003315 / 90.5s |
| filter-js-from-html | F / $0.428056 / 648.5s | F / $0.234408 / 398.3s | F / $0.539582 / 780.2s | F / $0.323300 / 463.4s | U / $0.004564 / 140.8s | U / $0.006412 / 132.0s | U / $0.004536 / 125.7s | F / $0.003114 / 115.8s |
| kv-store-grpc | P / $0.033640 / 63.9s | P / $0.039725 / 68.5s | P / $0.032324 / 62.3s | P / $0.033176 / 96.3s | P / $0.001985 / 67.6s | P / $0.004965 / 69.1s | F / $0.002653 / 69.7s | P / $0.002457 / 64.3s |
| log-summary-date-ranges | P / $0.028478 / 28.4s | P / $0.023486 / 34.1s | P / $0.039897 / 33.3s | P / $0.024483 / 29.9s | P / $0.002205 / 33.2s | P / $0.004046 / 30.7s | P / $0.001388 / 25.8s | P / $0.001083 / 23.6s |

## Appendix B. Token and call totals for each configuration

These sum saved whole-attempt usage, not nested stage times or overlapping stage
usage. Incomplete records remain flagged. Cache reads are tokens, not dollars.
Separate per-stage ledgers remain available in the source reports.

| Round | Arm | Input tokens | Cache-read tokens | Cache-write tokens | Output tokens | Model calls | Tool calls | Incomplete costs |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A | codex | 1,046,893 | 15,485,952 | 0 | 169,079 | 455 | 426 | 1 |
| A | pi | 751,347 | 5,845,632 | 0 | 138,503 | 385 | 439 | 0 |
| A | v1 | 708,138 | 3,312,640 | 0 | 157,703 | 290 | 654 | 1 |
| A | v2 | 737,314 | 4,368,256 | 0 | 119,171 | 452 | 871 | 1 |
| B | pi | 75,869 | 444,288 | 0 | 16,560 | 61 | 70 | 0 |
| B | v1 | 131,423 | 707,456 | 0 | 19,486 | 56 | 111 | 0 |
| B | v2 | 118,124 | 334,848 | 0 | 21,420 | 64 | 111 | 0 |
| B | v3 | 215,842 | 852,480 | 0 | 40,101 | 140 | 299 | 0 |
| C | pi | 86,796 | 578,176 | 0 | 27,997 | 49 | 48 | 0 |
| C | v1-original | 54,403 | 172,800 | 0 | 20,285 | 26 | 57 | 0 |
| C | v1-refined | 110,032 | 678,272 | 0 | 35,896 | 39 | 82 | 0 |
| C | v1-concise | 80,045 | 170,624 | 0 | 24,207 | 25 | 49 | 0 |
| C | v2-alone | 45,546 | 95,744 | 0 | 8,965 | 30 | 52 | 0 |
| C | v2-upfront | 40,639 | 173,312 | 0 | 9,616 | 43 | 71 | 0 |
| C | v2-selective | 46,610 | 110,848 | 0 | 8,207 | 30 | 52 | 0 |
| C | v2-concise | 44,438 | 93,440 | 0 | 9,183 | 31 | 54 | 0 |

## Appendix C. Excluded infrastructure originals and actual execution counts

Exclusions affect comparison selection only. Their recorded incurred spend remains
in total campaign accounting. Every replacement was selected regardless of result.

| Round | Task | Arm | Original status | Exception | Known USD | Cost complete? |
| --- | --- | --- | --- | --- | ---: | --- |
| A | merge-diff-arc-agi-task | v1 | completed | PermissionError | 0.05693280 | Yes |
| A | merge-diff-arc-agi-task | v2 | completed | PermissionError | 0.00338544 | Yes |
| A | multi-source-data-merger | v2 | completed | PermissionError | 0.00185234 | Yes |
| A | multi-source-data-merger | v1 | completed | PermissionError | 0.05993240 | Yes |
| A | nginx-request-logging | v1 | completed | PermissionError | 0.09898640 | Yes |
| A | nginx-request-logging | v2 | completed | PermissionError | 0.00196706 | Yes |
| C | kv-store-grpc | v1-refined | cost_unknown | - | 0.01517000 | No |
| C | filter-js-from-html | v1-refined | cost_unknown | - | 0.00978760 | No |

Across these three rounds there were **172 selected comparison slots**, **180 actor
executions including eight excluded originals**, and **three additional grading-only
replays**. Known model spend including excluded originals totals **at least
$15.71401454**, with five incomplete cost records. This covers only the three rounds
in this handoff, not earlier experiments or the assistant conversation. No exact
subscription-usage percentage is inferred from that dollar estimate.

## Appendix D. Source file hashes for this handoff

These SHA-256 values identify the saved comparison data used to generate the
appendices. The original calibration JSON still marks all three original HTML
attempts ungraded; the separate replay JSON supplies the later evidence.

| Source | SHA-256 |
| --- | --- |
| reports/harnesstax-sol61-v1/results.json | `6ab6436aa70c9fc9fcad1e92927a4229cdb27da7cc845de3f4298e0bf612b21f` |
| reports/refinement-pilot-v1/results.json | `cbcd250b0fc78f7210e7ef68dd53f1f0962164977b0b207c1db04990c1edf888` |
| reports/calibration-v1/results.json | `9b3765db6c992f9158e1683403276dfb89127fb3abac9f6e4cd2938f1b2ceaf6` |
| reports/calibration-v1/grading-replays/html-r1/outcomes.json | `b322080ca4a6f789c7c09a313b465994b83aad8d82ec8c76ff493f6277c8c377` |
