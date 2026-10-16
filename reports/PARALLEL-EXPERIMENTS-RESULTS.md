# Suffice parallel experiments — October 14, 2026

This round tests control policies, not a replacement for the underlying model. The strongest established efficiency result remains the earlier navigation-only improvement. We now also have real, completed coding failures on harder tasks, but no demonstrated capability-frontier improvement.

The coordinating engineering session runs in Pantheon Dev with Codex and the requested Astra-high parent. All five engineering subagents were explicitly GPT-6.1 Sol. Those engineering models are separate from benchmark models: live benchmark baselines use GPT-6.1 Sol low; the architect experiment changes only its worker to GPT-6 Luna low; adaptive effort additionally tests Sol medium. No Astra benchmark inference is included.

## Results

The 27-attempt architect campaign and all five bounded parallel investigations have finished their measurements and reporting. The recovery investigation stopped at its completed pilot; its separately prepared follow-up was not launched.

| Experiment | Observed result | What it establishes |
|---|---|---|
| Architect/worker workflow | 27/27 accepted patches, 26 completed executions; Sol worker +140.4%, Luna worker +52.2% cost versus solo | Cheap implementation lowered delegation cost, but parent overhead exceeded savings |
| Adaptive reasoning | Hard LRU task: low 0/2, medium 0/1, adaptive 0/1 accepted; zero adaptive switches | A real baseline failure, but no rescue or evidence about active escalation |
| Retrieval tournament | 40 offline packets; no method dominated; correct files sometimes contained none of the labeled repair lines | File recall alone is insufficient; no live coding-capability measurement |
| Test execution | All 18 scored repairs accepted; fixed scheduling cost 16.5% less and deferred 12/18 requests; selective deferred none | A narrow fixed-schedule efficiency signal with demonstrated feedback-loss risk; no capability gain |
| Cache retention | 8/8 scored patches accepted; retention cost 43.8% more and activated in all four treatment attempts | A negative efficiency result for this specific dynamic historical-body replacement |
| Failure recovery | Normal 1/3 and rollback arm 1/3 accepted; zero rollbacks | Real harder-task failures, but no active recovery efficacy |

### Architect/worker workflow

Across eight complete-cost groups, solo Sol averaged $0.0535208, Sol-worker delegation $0.12868875 and Luna-worker delegation $0.08146819. Luna was 36.7% cheaper than Sol within the same delegation workflow, but 52.2% more expensive than solo. Planning/review accounted for 96.6% of the Luna workflow's cost. Parent review changed source in one of nine Luna attempts; a different Sol-worker attempt exposed an invalid parent-generated test input, disclosed separately from independent acceptance.

All three historical YAML tasks passed in every arm. One earlier quota error made a review execution incomplete and cost unknown despite a passing patch; it was retained. Workflow permits more compute than solo and is a bundle of planning, deterministic context assembly, code-run checks and review. It does not establish an equal-budget capability gain or isolate packet assembly. Final hash/model/cost audit passed all 27 records. [Detailed findings](WORKFLOW-RESULTS.md).

### Adaptive reasoning

The initial YAML low/medium pair passed, and a post-reset BOM task also passed at low effort. A harder, separately pinned LRU-cache background-fetch lifecycle task then failed at low effort. Medium, adaptive, and repeated low each passed all three visible checks and five of six hidden checks, missing the same unchanged-stale-value update/disposal invariant.

The adaptive trigger watched two visible regression failures at distinct edit versions, or nine messages before any edit. Neither fired. Generated scenario failures were not controller inputs. This is evidence that the trigger misses an important kind of failure: confident completion with incomplete verification. It is not evidence that an actual low-to-medium switch cannot work. The follow-up reused the screened task and is not an untouched holdout. Equal ceilings also do not mean equal realized spending. [Report](../../suffice-experiments/adaptive-effort/reports/ADAPTIVE-EXPANDED-RESULTS.md) and [validation receipt](../../suffice-experiments/adaptive-effort/reports/adaptive-expanded-validation-receipt.json).

### Repository retrieval

Five original issue queries from picomatch and fast-glob were evaluated using lexical chunks, AST-name ranking, one-hop imports, and a hybrid. At the 4K estimated ceiling, AST file recall was 80% versus lexical 66.7%, but hunk coverage was 28.8% versus 30.0%. At 8K, lexical and hybrid tied at 90% file recall and 46.9% hunk coverage. All methods missed every repair-hunk line on two parser issues despite retrieving the relevant file at 8K.

These are UTF-8-bytes/3 ceilings, not actual model tokens, and equal ceilings did not imply equal consumption. AST here is an automatic ranking policy over chunks, not the earlier agent-directed navigation loop. Repair hunks are imperfect evidence proxies; historical failures and repairs were not executed in this offline experiment. Parent reran the five policy tests and all 40 packets with matching metrics and intact freeze. [Report](../../suffice-experiments/retrieval/reports/RETRIEVAL-RESULTS.md).

### Intelligent test execution

Three new scored YAML tasks, two repetitions and three policies produced 18 accepted repairs. Unrestricted testing averaged $0.0559059, fixed checkpoints $0.0466885 (16.5% less), and revision-selective execution $0.0475199 (15.0% less). All six matched task/repetition groups have complete cost telemetry. Fixed scheduling executed 6/18 requested public tests and deferred twelve; selective executed all 23 requests, so its cost difference cannot be attributed to avoided tests. Identical independent final acceptance/regression/upstream checks ran in every arm regardless of deferrals.

The fixed gate is global across suite kinds: run once, then wait for two meaningful production edits. A separate actual-process diagnostic showed it could suppress a new failing suite, leaving the model without useful feedback. The scored baseline passed every task, so there is no capability gain to measure here. Savings in test-process wall time are not model cost or CPU-cycle savings. Small samples, trajectory variation and concurrent load prevent a general efficiency claim. Independent post-campaign reruns passed acceptance, visible and upstream checks for all 18 saved patches; their additional 90.889 seconds of test workload is separate from benchmark inference.

Parent review identified a concurrency race: v1 updated its last-edit/seen state only after awaiting test execution, allowing simultaneous calls through the same gate. The completed trace audit detected no overlapping test processes or gate violations in the 21 post-reset live repairs. Intervals were inferred from completion times and subprocess latency; very small overlaps may be missed because invocation-start timestamps were absent. A separate serialized v2 fix passed eight concurrency checks after campaign completion; its behavior has not been benchmarked live. Frozen v1 bytes and results remain unchanged. [Report](../../suffice-experiments/test-execution/reports/TEST-EXECUTION-RESULTS.md).

### Cache-aware retention

Append-only averaged $0.0479511 versus retention $0.068972 across four matched pairs, with all patches accepted. Retention was more expensive in every pair. It removed old read-only tool bodies while retaining exact recoverable references, work state, all assistant/user messages and call/result edges. It activated on ten scored requests; no recovery calls occurred.

Append-only used 55,887 uncached input tokens and 104,704 cache-read tokens; retention used 100,539 and 73,600 respectively. Every replacement included current state, which could change old prompt prefixes again after later edits. This is consistent with cache disruption but does not isolate it from different model trajectories, ordering and cache warmth. The conclusion applies to the tested dynamic replacement policy. Static references plus append-only state remain untested. Twenty-six focused checks passed; 935 integrity checks and 16 live archive-hash checks passed. [Report](../../suffice-experiments/cache-retention/reports/CACHE-RETENTION-POSTRESET-RESULTS.md).

### Failure recovery and checkpoints

Both arms passed the aliased-merge task and failed both immutable-finalizer repetitions, despite passing visible checks. Normal cost $0.1912624 and the rollback arm $0.2288344 over three attempts each. With zero actual rollbacks, those differences cannot establish recovery-policy efficiency. Two single failed-state observations never met the two-per-attempt trigger.

An automatic content-safety check stopped the engineering subagent's turn. The existing frozen pilot finished normally; the blocked action was not retried. A read-only parent audit verified existing frozen inputs, baselines, immutable files, model identities and patch records. Prepared LRU work and a larger recovery campaign were not launched. [Parent-verified results](RECOVERY-POSTRESET-RESULTS.md).

## What has worked before, and what has not

The earlier 48-run `sol-tools-v1` comparison passed every frozen acceptance and upstream regression check. Across 11 complete-cost groups, navigation alone reduced mean estimated model cost 24.8%, compact printed responses 19.8%, and both 19.4%. Combining them did not compound the savings. This was Sol low, three historical tasks and a small number of repeats, with two incomplete cost totals preserved. [Earlier findings](TOOL-EFFICIENCY-RESULTS.md).

Navigation uses local syntax parsing to find definitions, read exact source and find candidate identifier references. It is not an extra LLM or a semantic graph. Compact printed responses change what a tool returns initially; replacing old conversation bodies later is a different intervention with different cache behavior. The retention result therefore does not contradict the earlier compact-response result.

Earlier Luna-first whole-task implementation with Sol review preserved six of six successes but cost 70.6% more than Sol alone. State helpers, pruning, extra watchers and reproduction-first policies did not establish a repeatable accuracy-preserving efficiency gain. Aggressive history rewriting sometimes lost useful state; conservative policies often did nothing. Small synthetic prompt/codemode bundles were promising, but did not isolate their ingredients or compare against unrestricted stock Codex/Claude Code.

## Recommended next experiments

1. **Verification that covers the stated behavior.** Use fresh stateful tasks and require a compact requirement-to-check map, with actual executable API sequences covering replacement, cancellation, cleanup and unchanged-value cases where relevant. Compare ordinary verification against this policy under a fixed total model-cost budget, including test design and repair. Keep independent hidden tests unavailable to every repair actor. Start from real low-effort failures and count success per total budget, not successful-patch cost alone. Do not tune on these hidden failures and relabel them as a holdout.
2. **Retrieval within large definitions.** Compare current navigation with query-driven branch-level snippets and demand-driven pagination. Record whether the necessary code becomes available, additional reads and final repair success. A larger symbol or import neighborhood is not automatically useful context. A scout model should be a later separate arm whose briefing, answer and parent rereads are all charged.
3. **Stable cache retention on genuinely long trajectories.** Test immutable archive references with current state appended once, against append-only. Gate the pilot on real retention activation and track cache-read/uncached costs, recoveries and stale-source mistakes. Do not use removed characters as the objective.

Preserve low-effort, append-only navigation as the current baseline. Delay training a routing policy until decision traces include enough active successes, failures and costs on diverse held-out tasks. A useful future controller should learn the expected value of a read, test, effort increase or delegation; these small samples do not yet supply that training evidence.

## Accounting and limitations

All dollar figures are API-equivalent benchmark-inference estimates from the pinned provider runtime, not subscription charges or total project costs. Engineering-agent inference is excluded. Failed attempts count, and unknown provider usage remains unknown. The user's weekly-limit reset restored execution; pre-reset receipts were not replaced. No API-key fallback was used.

| Investigation, including its pre-reset attempts and screening | Live attempts | Known estimate | Unknown attempt totals |
|---|---:|---:|---:|
| Architect A/B/C | 27 | $2.47958624 | 1 |
| Adaptive effort | 9 | $0.57221200 | 2 |
| Test execution | 22 | $1.05807360 | 1 |
| Cache retention | 11 | $0.64826960 | 1 |
| Recovery | 10 | $0.46385520 | 4 |
| Retrieval | 0; 40 offline packets | $0 | 0 |
| Total for these investigations | 79 | **$5.22199664 known lower bound** | **9** |

This is an accounting sum, not pooled accuracy across different tasks or a total for all historical Suffice work. All nine unknown totals remain unknown; their known portions are already included. The earlier campaigns and engineering-session inference are outside this table.

Experiments stayed in five existing independent Git worktrees with frozen campaign inputs. Shared pinned dependencies/authentication were not reconfigured. No new sandbox/container infrastructure was added. Jobs overlapped on one PC/provider, limiting causal latency and cache conclusions. The historical tasks may be present in model training, are small cohorts from a few repositories, and selected upstream suites exclude documented dependency/build-heavy checks. There is no demonstrated superiority over stock Codex or Claude Code and no proven capability-frontier improvement.


## Later offline diagnosis of failure granularity

The October 14 offline review preserves all original scores but narrows what the failing assertions establish. All four harder LRU rejections concern missing `status.oldValue`; preceding unchanged-value nondisposal, signal and update-classification assertions passed. All four immutable-finalizer rejections concern the exact exception `reason` prefix. The public finalizer prompt did not explicitly demand verbatim preservation, and source-location/placeholder assertions after that failure never executed. These are not evidence of broad disposal or finalization failure. See [the detailed diagnosis](friction-research/CAPABILITY-FAILURE-DIAGNOSIS.md).
