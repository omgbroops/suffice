# Nemotron retrieval and revision-aware evidence

October 14, 2026. Two isolated GPT-6.1 Sol engineering subagents implemented these investigations. Live repair actors use GPT-6.1 Sol low in the established Pi harness. Nemotron embedding requests use the explicitly authorized free OpenRouter route. Earlier campaigns and their worktrees remain preserved.

## Nemotron: better localization did not produce cheaper repairs

The offline comparison evaluated 60 packets from six historical tasks across minimatch, path-to-regexp and marked. All rankers used identical source chunks and estimated context ceilings. At the 2048-unit ceiling, semantic retrieval covered **73.8%** of old-side repair-hunk lines on average versus **43.9%** for lexical retrieval. At 4096 units, the figures were **100.0%** versus **77.2%**. These are localization proxies using UTF-8 bytes/3, not actual tokenizer counts or evidence of sufficient repair context.

The separate live comparison found **no efficiency or capability improvement** on its scored cohort:

| Scored arm | Accepted within the common budget | Mean estimated repair cost |
|---|---:|---:|
| Sol low + navigation | 4/4 | $0.0249958 |
| Same + fixed-query semantic retrieval | 4/4 | $0.0265604 |

Semantic retrieval cost **6.3% more** on average, despite reducing navigation calls from 15 to 11. It added four semantic calls and used more uncached and cached input. The four matched pairs were -20.7%, +35.0%, +17.7% and +7.1% relative cost for the treatment. The sign reversed between repetitions of one task. This tiny, concurrent, cache-sensitive cohort does not establish a general cost effect. Both baselines passed; there was no failed baseline to rescue.

The four-attempt activation pilot also passed. All 12 live repairs passed independent final acceptance and the declared regression checks; independent reconstruction from frozen baselines and saved patches reproduced the outcomes. Known repair inference was **$0.2986564**, with no unknown repair totals or budget overruns. No new default was enabled.

Important scope:

- This tested initial retrieval against a fixed public issue query, with at most two packets and normal navigation still available. It did not test arbitrary model-written queries, incremental re-embedding after edits, or long-term cross-task evidence reuse. All scored treatment attempts used the semantic tool once.
- Five queries were researcher paraphrases of public PR problem descriptions and one an original issue. The query author saw PR prose. All live tasks had been offline-screened; this is not an untouched holdout, and public historical fixes may be in training.
- TypeScript parameter properties defeat the current syntax index on both route-parser snapshots. Some semantic gains compensate for that implementation limitation. Semantic retrieval still lost to lexical on one task at the smaller ceiling and missed another task entirely. It did not dominate.
- Route regression executed 345/350 selected original data-driven cases by revision. Marked executed 652 CommonMark examples with a preservation-or-improvement rule: output must match the spec or the original baseline. Existing baseline mismatches were retained explicitly, not counted as conformance. Full npm/build/type/lint suites were excluded.

There were **33 embedding HTTP admissions** including development and probes. The 32 completed responses reported zero charges; an interrupted request has unknown usage/cost. The scored offline index/query work used 16 requests, 93,858 provider tokens and about 11.24 seconds of summed HTTP time, with zero reported cost. Live retrieval reused cached vectors and made no additional embedding requests. Free retrieval does not make source tokens subsequently read by Sol free.

The first index was stopped before scoring when parent review found missing passage/query modes. A separately frozen v2 used explicit modes, mode-aware cache keys and conservative input sizes; the original bytes/receipts remain. A serving-model alias was explicitly recorded rather than silently rewritten. The pilot also exposed that a configured output limit was not sent by the subscription transport; the scored protocol makes no output-token-cap claim. Cost/turn/time admission bounds and post-hoc budget eligibility remain explicit.

The parent independently replayed all 60 cached packets, recomputed region coverage and reconciled the exact 16 scored embedding receipt IDs. All 57 originally frozen files matched. Supplemental dependency/helper checks matched the starting commit but were not retroactively treated as part of the original freeze. Raw response-index uniqueness was not recorded by v2, so it cannot be proven retrospectively; a later validator is separate from the scored implementation.

[Detailed branch report](../../suffice-experiments/nemotron-retrieval/reports/NEMOTRON-RESULTS.md), [live patch audit](../../suffice-experiments/nemotron-retrieval/reports/NEMOTRON-LIVE-AUDIT.json), [parent cached audit](nemotron-offline-parent-audit.json).

## Revision-aware evidence record: more bookkeeping, no acceptance gain

The independent evidence worktree compares normal navigation/testing, a compact evidence record, and that record with requirement-directed checks. Scored arms have equivalent generic behavioral-check execution and the same total inference ceiling; the treatment must pay for bookkeeping and verification. The record begins empty each attempt, conservatively tracks source/test revisions and appends observations without rewriting previous conversation bodies. This is within-task tracking, not warm cross-task reuse or restart recovery.

The first activation pilot passed all four repairs. A separate, larger stateful p-map screen also produced three accepted patches, but only the baseline was eligible under the $0.12 budget. The record arm exceeded the ceiling and has an unknown full cost after a recovered provider error; the directed-verification arm overshot on its final response. These were not within-budget rescues. Generated-check audit identified unsupported assumptions, including demanding an exact number of concurrent iterator pulls when the contract only specified an upper bound.

All 15 separately frozen scored attempts across quick-lru, p-map and eventemitter3 passed independent acceptance and stayed within budget. Five complete matched groups give:

| Scored arm | Accepted within $0.12 per attempt | Mean estimated inference | Change from A |
|---|---:|---:|---:|
| A: Normal navigation and testing | 5/5 | $0.0275172 | baseline |
| B: Same + revision-aware evidence record | 5/5 | $0.0509652 | +85.2% |
| C: Same record + requirement-directed checks | 5/5 | $0.05653968 | +105.5% |

A and B each executed five generated behavioral checks in the scored cohort; C executed nine. The generic executor was equally available to every scored arm. The initial four-run pilot had a different tool-access arrangement and is not pooled into scored comparisons. A separately frozen harder three-run screen used the fair executor. An unused scored-v1 freeze was preserved; scored-v2 added exact read-hash telemetry and durable events without changing its previously fixed tasks, prompts, schedule, budgets or graders.

All 22 pilot/screen/scored patches were accepted, but only 20 executions were eligible under their budget. The two ineligible harder-screen treatments are retained, including one unknown full cost. Known evidence-investigation inference totals **$1.1315808**. There was no rejected baseline patch to rescue, so this round supplies no capability gain despite real mechanism activation.

This implementation requires the model to maintain requirement/evidence links, and marks evidence stale conservatively after source changes. Its bookkeeping and verification cost were not offset on these tasks. It does not establish that all persistent evidence systems are uneconomical, that targeted tests are useless, or that the model reliably detected all missing evidence. Model-free reconstruction reran all 22 saved patches and all 33 generated test sources, with 594 integrity checks. Verification is independent of repair actors, but was authored within the same engineering investigation, not by a blinded external team.

The scored baseline made **zero exact repeated source reads**, compared with two in B and zero in C. This metric matches path, range and returned-text hash; partial overlaps are not counted. There was no measured exact-repeat waste for the record to remove. B/C read their records 5/7 times, exposing 28/43 fresh evidence entries; exposure is not proof that the information was used correctly. Later links reused exposed fresh IDs zero/nine times respectively. The directed arm's one scored assertion failure was an invalid callback expectation that the actor corrected; it did not lead to a source repair.

Only 17 of 33 generated test sources passed on the historical reference, but that does **not** mean the other 16 were all invalid. A supplemental, explicitly post-hoc sensitivity audit checked two expanded-task edges against every affected scored patch: all six quick-lru patches handled infinite and negative-infinite ages, and all three eventemitter3 patches handled once listeners in a nested stale snapshot. The original and historical reference failed those supplemental cases. This exposes the difference between the authored expanded task and the historical repair, plus a gap in the primary grader's coverage. It gives no treatment advantage because all arms passed. Original scores were not changed and actors received no feedback from these audits. Other blocking-generator cancellation expectations remain unresolved contract extensions.

All five B attempts and four of five C attempts finished with unresolved entries, mostly general hidden-acceptance or bounded-check caveats rather than concrete known defects. None finished with stale active links. Treating every such caveat as a hard stop would have rejected accepted patches. This implementation therefore has not demonstrated a reliable detector of insufficient evidence.

The parent verified that Node 24.15's filesystem permission flag permits network access using a local-only loopback probe. There was no external traffic in that probe. Static review of 126 saved actor programs and 33 generated test sources found no network or solution-retrieval patterns, but this is neither packet tracing nor proof against obfuscated behavior. Reports distinguish absence of a supplied network tool from network isolation; no new sandbox infrastructure was introduced. [Boundary receipt](evidence-network-boundary.json).

[Detailed branch report](../../suffice-experiments/evidence-record/reports/EVIDENCE-RECORD-RESULTS.md), [per-attempt outcomes](../../suffice-experiments/evidence-record/reports/evidence-results.json), [independent reconstruction audit](../../suffice-experiments/evidence-record/reports/evidence-independent-audit.json).

## Interpretation and accounting

These investigations test specific implementations on bounded workloads. Localized source, a current receipt or a model-written requirement link is evidence to inspect, not a proof of task completeness. The evidence record's freshness flags are diagnostics; they do not themselves stop the model from declaring completion or establish that it identified every requirement.

All dollar amounts are API-equivalent benchmark inference estimates, not subscription invoices or total project spending. Engineering-agent inference is excluded. Setup, failures and unknown costs remain separately visible. Provider/machine overlap and cache warmth limit latency and causal cost interpretations. The work did not use the unavailable `decomp` scripts, scan local chat transcripts, or change the prior frozen experiments.

The current default remains low-effort navigation with append-only history. Better localization alone did not justify mandatory semantic retrieval, and mandatory evidence bookkeeping did not save cost. Both treatments should remain experimental. Before adding another controller, use tasks where the baseline demonstrably spends time rediscovering facts or completes an incorrect repair; these scored cohorts had no such acceptance failures.

This new round contains **34 live repair attempts**, **60 offline retrieval packets**, and **33 embedding HTTP admissions**. Known benchmark inference is **$1.4302372**, with one incomplete repair total and one interrupted embedding request whose usage/cost is unknown. This sum excludes the earlier six investigations and all engineering inference.

## Portable review and final status

Both experiments passed isolated exported-layout replay without original actor workspaces. Nemotron reproduced 60 packets and 12 saved repairs with no new API calls. The evidence export reproduced all 22 saved repairs, 33 generated test sources and 594 integrity checks under filesystem read allowances restricted to the exported tree and existing pinned dependencies. Two failed portability checks were preserved; fixes affected only postcampaign audit helpers, not frozen experiments. Five evidence policy checks and seven retrieval/adapter checks passed; later adapter hardening is explicitly unbenchmarked.

The local review archive is prepared by `scripts/package-research.py`, with file hashes and a full ZIP read-back verification. It includes both new branches' public source/vector/label/test/patch/usage evidence and the detailed reports and implementation from the earlier branches that were previously missing. Older full ignored raw campaign archives are not all included; the manifest identifies exactly which evidence was exported. Credentials, shared dependencies and engineering transcripts are excluded. Cached reproduction requires the documented Node version and pinned dependencies, with no model authentication or inference.

[Nemotron export replay](../../suffice-experiments/nemotron-retrieval/reports/NEMOTRON-EXPORT-REPLAY.json), [evidence export verification](../../suffice-experiments/evidence-record/reports/evidence-export-verification.json), [supplemental sensitivity audit](../../suffice-experiments/evidence-record/reports/evidence-supplemental-sensitivity.json). All repair/audit jobs have stopped, and implementations remain in their separate worktrees.
