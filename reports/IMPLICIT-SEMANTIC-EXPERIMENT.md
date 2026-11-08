# Implicit semantic context: engineering and experiment

This study evaluates compact deterministic evidence delivered behind ordinary tools. It does not require model-facing graph navigation. Defaults remain disabled. Results below describe three historical production snapshots and two repetitions; they do not establish general savings.

Implementation/source freeze: `0c3132520d5ab2a8be57d15bd58b9dbfd16c8f15`. Execution/manifest commit: `44440b2577e925b150e076a53c88a0e27a599516`. Branch: `codex/implicit-graph-workflow-v1`. Completed schedule: 24/24; stop reason: none.

Semantic retrieval worked mechanically but did not show a consistent efficiency gain. In the original 24 attempts, it used 18.4% more total input and 5.0% more mean inference cost than baseline. Every assisted arm passed 6/6 versus baseline 5/6; simpler AST assistance achieved the same acceptance. The compiler-configured follow-up stopped after 2/8 attempts because of unknown provider usage. Defaults remain off.

## Original 24-attempt outcomes (intention to treat)

| Metric | Baseline | Compact AST | Implicit semantic | Semantic + impact |
|---|---:|---:|---:|---:|
| Accepted tasks | 5/6 | 6/6 | 6/6 | 6/6 |
| Completed agent attempts | 5/6 | 6/6 | 6/6 | 6/6 |
| Regression failures | 1 | 0 | 0 | 0 |
| Mean total inference cost | $0.041065 | $0.042511 | $0.043111 | $0.044340 |
| Cost per accepted task (all attempt costs) | $0.049278 | $0.042511 | $0.043111 | $0.044340 |
| Mean total input tokens including cache | 43640 | 54509 | 51656 | 48081 |
| Mean uncached input tokens | 14584 | 14701 | 15197 | 16060 |
| Mean cached input tokens | 29056 | 39808 | 36459 | 32021 |
| Mean output tokens | 899 | 913 | 907 | 902 |
| Mean model generations | 5.33 | 6.00 | 5.67 | 5.50 |
| Mean tool calls (parents + children) | 22.33 | 23.50 | 22.67 | 22.67 |
| Mean file reads | 9.17 | 9.33 | 8.83 | 9.33 |
| Mean production source reads | 8.17 | 8.33 | 7.67 | 8.17 |
| Mean production source bytes (reads + search) | 44957 | 43602 | 44455 | 44271 |
| Mean search calls | 1.17 | 1.00 | 1.33 | 1.33 |
| Mean follow-up file reads after first production read | 8.17 | 8.33 | 7.83 | 8.33 |
| Mean source bytes including repeated reads/search | 46902 | 44938 | 47009 | 46229 |
| Mean packet tokens (envelope) | 0.0 | 193.0 | 220.3 | 455.7 |
| Mean retained packet text replay tokens | 0.0 | 698.0 | 576.0 | 958.2 |
| Mean wall seconds including independent grading | 37.98 | 35.86 | 35.38 | 33.40 |
| Mean agent wall seconds | 36.47 | 34.28 | 33.86 | 31.83 |
| Mean analysis-layer CPU ms | 0.00 | 279.33 | 573.67 | 850.67 |
| Mean analysis-layer elapsed ms | 0.00 | 213.27 | 455.86 | 713.15 |
| Mean compiler initialization ms | 0.00 | 0.00 | 95.40 | 76.15 |
| Mean incremental compiler update ms | 0.00 | 0.00 | 0.00 | 70.89 |
| Observed peak heap MiB (whole process) | not sampled | 198.40 | 176.94 | 189.82 |
| Max observed heap above attempt start MiB | not sampled | 154.85 | 24.42 | 25.11 |

## Task provenance and independent screening

| Task | Pre-fix commit | Upstream repair | Source files / lines | Static import edges / cross-file relation edges | Screening |
|---|---|---|---:|---:|---|
| ky-option-merge: Widely reused exported option merge | `e68ea7ad3080fa25ce2eba6a367c00dfff74f0f3` | [e06d3510](https://github.com/sindresorhus/ky/commit/e06d351070314670526711e79d1a66ce0b932a50) | 30 / 4176 | 179 / 946 | Pre-fix fails; upstream repair and both regression snapshots pass |
| immer-array-patches: Multi-module behavior with dependent callers | `484f5cfa19906365b0ce7366478cc0b1150940e7` | [fee2c4fa](https://github.com/immerjs/immer/commit/fee2c4fa1585d5131fc28a991853c692647632f7) | 17 / 3357 | 216 / 1943 | Pre-fix fails; upstream repair and both regression snapshots pass |
| redux-preloaded-contract: TypeScript contract/API migration across modules | `f50323815b8f5d547e6ba1b96e3876f4cb7b10cd` | [ac804a58](https://github.com/reduxjs/redux/commit/ac804a58126d778e19e830ad7a7732bd6b57437d) | 16 / 1546 | 33 / 38 | Pre-fix fails; upstream repair and both regression snapshots pass |

All production files are copied unchanged from pinned GitHub archives, with original license/package metadata and an adapted public offline test harness. Upstream docs, examples and runner dependencies are omitted; these are complete production trees, not entire repository checkout benchmarks. Ky checks exercise option merging through its public request/factory paths using an in-memory fetch. Immer checks adapt the upstream array-method patch-replay regressions and extend them to nested arrays, inverse replay and redundant nested paths. Redux checks use strict TypeScript 5.9.3 compilation with positive and negative contracts plus runtime store/middleware regression checks; its upstream repair spans six modules.

Eligibility was decided from source/module structure, tests and reproducibility, with no model pilots. Before freezing, a Windows virtual compiler-host path bug was fixed, and negative Redux inputs were corrected to use booleans: combined reducer inputs legitimately include their output state type. The frozen screening field named `crossFileRelationships` accidentally counted differing symbol IDs, including some same-file edges. The table uses corrected owning-file comparisons from independent archive replay; original screening receipts remain unchanged. No task, source, grader or schedule within the original frozen study was changed after scoring began.

Archive replay exposed a second screening defect: the production-only Redux snapshot omitted its upstream tsconfig.json. With the package declaring ESM, the graph default NodeNext resolver left its extensionless type imports unresolved. Offline restoration raised resolved cross-file type dependencies from 0 to 128 (cross-file relations 38 to 347). The original Redux semantic results therefore test generic import context, not strong resolved cross-module contract retrieval. They remain in the original intention-to-treat table. A separately frozen eight-attempt correction restores only the original upstream tsconfig, schedules every arm twice with identical model/settings/prompt/source/grading, and counts all additional inference against the same cap. It is explicitly a follow-up after detecting an activation defect, not a replacement for unfavorable attempts. See configuration-diagnostic.json and the corrected manifest.

Hidden acceptance and reference sources stay outside worker snapshots. Tools have no shell, network or parent-directory source access. Visible and hidden tests run in separate Node permission processes with read access restricted to the worker, the exact invoked test and the pinned TypeScript dependency; no spawning, network, write permission or credentials. Tests are immutable. Acceptance requires both hidden acceptance and public regression success, production-only patch scope and immutable file integrity. Completion is reported separately.

## Frozen controls and architecture

All arms use gpt-6.1-sol, low effort, the same Pi 1.2.0/codemode harness, identical core instructions and task prompt, the same six ordinary tools, 4,096 output tokens per dispatch, 24 generations, 100 tool calls and a 300-second timeout. Each attempt has a $0.50 conservative reservation ceiling. No specialized graph/AST tools, mandatory navigation rounds, edit gates, recipes, helper models, retries or conversation compaction are enabled. A frozen schedule rotates arm order across tasks and reverses the second repetition, but is not fully counterbalanced (some arms retain their first position within a task). Working-directory metadata contains arm/run names, so workers are not fully blinded. Subscription provider cache reuse and machine load remain uncontrolled.

A has ordinary read/search/edit/test behavior. B adds only compact syntactic import/export candidate excerpts to ordinary reads. C uses the existing TypeScript checker graph for resolved bounded retrieval. D adds cached edit-impact evidence and a conservative verification suggestion. All intervention work happens within existing tool execution; it dispatches zero separate model calls. Differences in subsequent session generations remain part of the measured outcome.

The reusable adapter preserves original source content and schemas. In Pi, it keeps child tool results intact and appends separate text blocks to the completed codemode result, so projecting `.text` cannot silently discard context. It coalesces reads/edits per source path and analyzes the final batch snapshot. Index failures, parse failures, detected stale sources and budget exhaustion abstain without blocking edits. Context remains untrusted repository evidence.

The graph inventories admitted source/declarations using the existing 800-file/12-MiB limits. Relationship analysis expands at most six files within two module hops and considers at most 32 neighboring candidates. Exported declarations intersecting the source span are capped at three; truncation is explicit. Direct calls, data flow and types rank before references/imports. Static test candidates are reserved when available. There is no automatic `allAnalysis()` traversal. Full-graph traversal was used only for offline eligibility statistics, outside workers.

Packets use stable IDs, exact source references, short literal excerpts, a revision prefix and unresolved/unexpanded/omitted counts. Audit logs retain full hashes. The pinned o200k_base tokenizer measures each serialized text-block envelope plus two framing tokens. Because the Sol tokenizer is unspecified, the same 400 limit is also enforced on UTF-8 bytes; actual packets are therefore substantially smaller than 400 BPE tokens. The session ceiling is 1,200 measured envelope tokens. These conservative limits are a study-specific policy, not an optimized budget.

Line hashes and relationship keys suppress already obtained evidence. Initial-region state prevents repeated reads from draining omitted facts into context. Comment-only and narrow local-binding edits abstain before repository expansion. Relevant new relations and changed contracts may produce deltas. Unchanged implementation relations and repeated verification plans remain cached. Multi-symbol edits select the changed line span. TypeScript checks are suggested for external TS changes; suggested tests are candidates and full-suite validation remains required. Static signatures never prove behavioral equivalence.

Use `--auto-context`, `--auto-impact` and `--auto-verify` independently; `--context-mode ast` selects syntax mode. `--packet-tokens` and `--context-tokens` configure budgets. All are off by default. See [implementation details](../docs/IMPLICIT-SEMANTIC.md).

## Activation and usefulness audit

| Metric (totals) | Baseline | Compact AST | Implicit semantic | Semantic + impact |
|---|---:|---:|---:|---:|
| Attempts receiving packets | 0/6 | 4/6 | 6/6 | 6/6 |
| Trigger/analysis records | 0 | 65 | 61 | 63 |
| Abstentions (including irrelevant/disabled events) | 0 | 51 | 46 | 30 |
| Actual bounded region expansions | 0 | 37 | 34 | 56 |
| Expanded regions returning no packet | 0 | 23 | 19 | 23 |
| Packets delivered | 0 | 14 | 15 | 33 |
| Novel source-validated facts | 0 | 16 | 19 | 31 |
| Previously available/duplicate delivered facts | 0 | 0 | 0 | 0 |
| Verification plans delivered | 0 | 0 | 0 | 16 |
| Plans naming specific candidate tests | 0 | 0 | 0 | 0 |
| Plan-only packets | 0 | 0 | 0 | 10 |
| Repeated verification instruction lines | 0 | 0 | 0 | 10 |
| Cached file analyses reused | 0 | 0 | 143 | 226 |
| Detected stale sources | 0 | 0 | 0 | 0 |
| Unresolved occurrences (can repeat) | 0 | 338 | 3483 | 5371 |
| Mean repeated ordinary source tokens | 2647.3 | 2721.0 | 2610.0 | 2672.7 |
| Mean later source tokens overlapping packet excerpts | 0.0 | 4.0 | 1.8 | 0.0 |

Independent audit checked 62 packets by replaying ordinary edits from frozen bytes, validating source snippets and semantic revision hashes, enforcing packet budgets and locating every appended packet in the actual model transcript. Audit errors: 0. The raw audit records each trigger, root symbols, cached relationships, decision, delivered tokens, uncertainty and subsequent source requests. “Novel” means source-valid evidence absent from prior ordinary outputs and duplicate keys; it does not prove the model used the evidence or that a future read was prevented. Plan-only packets are counted separately from facts.

Follow-up reads use a common anchor: the first completed production file read, followed by later file reads in that attempt. Search calls and source bytes are reported separately. Packet-overlap tokens quantify subsequent rereading of an automatically supplied source line. A lower follow-up count is observational; no transcript establishes an individual prevented action. Targeted verification coverage is not measured: no test is skipped or replaced, and public/hidden checks remain authoritative. Static candidate paths do not establish coverage.

## Matched baseline comparisons

| Intervention | Pairs | Both accepted | Mean cost delta | Mean input delta | Mean generation delta | Mean follow-up read delta |
|---|---:|---:|---:|---:|---:|---:|
| compact-ast | 6 | 5 | $0.001446 | 10869 | 0.67 | 0.17 |
| implicit-semantic | 6 | 5 | $0.002046 | 8016 | 0.33 | -0.33 |
| semantic-impact | 6 | 5 | $0.003275 | 4441 | 0.17 | 0.17 |

Paired differences include failures; they match task and repetition. Cost per acceptance includes all attempt costs. If acceptance differs, cost comparisons are not evidence of efficiency at matched correctness. Even equal acceptance on this small cohort does not establish equivalence.

## Every recorded attempt

| Task | Arm | Rep | Accepted | Status | Cost | Generations | File reads | Source bytes | Packets | Plans |
|---|---|---:|---|---|---:|---:|---:|---:|---:|---:|
| ky-option-merge | baseline | 1 | true | completed | $0.030884 | 5 | 5 | 20062 | 0 | 0 |
| ky-option-merge | compact-ast | 1 | true | completed | $0.032070 | 5 | 6 | 21010 | 3 | 0 |
| ky-option-merge | implicit-semantic | 1 | true | completed | $0.032201 | 5 | 6 | 22124 | 2 | 0 |
| ky-option-merge | semantic-impact | 1 | true | completed | $0.031787 | 5 | 5 | 21336 | 3 | 1 |
| immer-array-patches | compact-ast | 1 | true | completed | $0.036011 | 5 | 6 | 25153 | 0 | 0 |
| immer-array-patches | implicit-semantic | 1 | true | completed | $0.038828 | 5 | 5 | 31164 | 5 | 0 |
| immer-array-patches | semantic-impact | 1 | true | completed | $0.036494 | 5 | 7 | 26790 | 6 | 1 |
| immer-array-patches | baseline | 1 | true | completed | $0.037206 | 5 | 5 | 30515 | 0 | 0 |
| redux-preloaded-contract | implicit-semantic | 1 | true | completed | $0.057777 | 7 | 16 | 88462 | 1 | 0 |
| redux-preloaded-contract | semantic-impact | 1 | true | completed | $0.052270 | 5 | 16 | 88764 | 7 | 6 |
| redux-preloaded-contract | baseline | 1 | false | error | $0.050498 | 5 | 16 | 91233 | 0 | 0 |
| redux-preloaded-contract | compact-ast | 1 | true | completed | $0.058987 | 8 | 15 | 84732 | 4 | 0 |
| ky-option-merge | baseline | 2 | true | completed | $0.031821 | 5 | 6 | 22030 | 0 | 0 |
| ky-option-merge | semantic-impact | 2 | true | completed | $0.043793 | 5 | 5 | 22021 | 3 | 1 |
| ky-option-merge | implicit-semantic | 2 | true | completed | $0.030958 | 5 | 4 | 19595 | 1 | 0 |
| ky-option-merge | compact-ast | 2 | true | completed | $0.030579 | 5 | 5 | 20222 | 3 | 0 |
| immer-array-patches | compact-ast | 2 | true | completed | $0.039912 | 5 | 8 | 33363 | 0 | 0 |
| immer-array-patches | baseline | 2 | true | completed | $0.039645 | 5 | 8 | 32540 | 0 | 0 |
| immer-array-patches | semantic-impact | 2 | true | completed | $0.041603 | 5 | 8 | 33429 | 6 | 1 |
| immer-array-patches | implicit-semantic | 2 | true | completed | $0.040125 | 5 | 6 | 31947 | 5 | 0 |
| redux-preloaded-contract | implicit-semantic | 2 | true | completed | $0.058779 | 7 | 16 | 88764 | 1 | 0 |
| redux-preloaded-contract | compact-ast | 2 | true | completed | $0.057506 | 8 | 16 | 85146 | 4 | 0 |
| redux-preloaded-contract | baseline | 2 | true | completed | $0.056338 | 7 | 15 | 85034 | 0 | 0 |
| redux-preloaded-contract | semantic-impact | 2 | true | completed | $0.060094 | 8 | 15 | 85034 | 8 | 6 |

## Per-task outcomes

| Task | Arm | Accepted | Mean cost | Mean generations | Mean file reads | Mean source bytes |
|---|---|---:|---:|---:|---:|---:|
| ky-option-merge | baseline | 2/2 | $0.031352 | 5.00 | 5.50 | 21046 |
| ky-option-merge | compact-ast | 2/2 | $0.031325 | 5.00 | 5.50 | 20616 |
| ky-option-merge | implicit-semantic | 2/2 | $0.031579 | 5.00 | 5.00 | 20860 |
| ky-option-merge | semantic-impact | 2/2 | $0.037790 | 5.00 | 5.00 | 21679 |
| immer-array-patches | baseline | 2/2 | $0.038425 | 5.00 | 6.50 | 31528 |
| immer-array-patches | compact-ast | 2/2 | $0.037962 | 5.00 | 7.00 | 29258 |
| immer-array-patches | implicit-semantic | 2/2 | $0.039477 | 5.00 | 5.50 | 31556 |
| immer-array-patches | semantic-impact | 2/2 | $0.039049 | 5.00 | 7.50 | 30110 |
| redux-preloaded-contract | baseline | 1/2 | $0.053418 | 6.00 | 15.50 | 88134 |
| redux-preloaded-contract | compact-ast | 2/2 | $0.058246 | 8.00 | 15.50 | 84939 |
| redux-preloaded-contract | implicit-semantic | 2/2 | $0.058278 | 7.00 | 16.00 | 88613 |
| redux-preloaded-contract | semantic-impact | 2/2 | $0.056182 | 6.50 | 15.50 | 86899 |

## Why the previous explicit workflow inflated context

The raw v2 audit is preserved in `implicit-previous-overhead.json`. These local BPE categories overlap and are not an additive or causal decomposition:

| Mean per attempt | Baseline | AST-assisted | Semantic-assisted | Semantic-optional |
|---|---:|---:|---:|---:|
| System instructions | 141.0 | 179.0 | 285.0 | 162.0 |
| Tool-observation tokens | 3178.0 | 3195.2 | 12203.8 | 3032.0 |
| Graph-result tokens | 0.0 | 0.0 | 9240.5 | 0.0 |
| Retained observation replay tokens | 7086.0 | 9327.2 | 46926.2 | 6797.7 |
| Repeated relationship occurrences | 0.0 | 0.0 | 6.7 | 0.0 |
| Generations after first edit | 1.3 | 1.2 | 2.5 | 1.3 |

Whole-observation equality found no exact duplicates, and repeated numbered file-read lines were absent in those v2 runs. Graph relationships still recurred across results/revisions. Extra generations exposed accumulated observations repeatedly; the semantic arm had longer instructions and more post-edit generations. Cached provider tokens reduced some estimate charges but did not remove retained context. These observations cannot isolate additional reasoning, prove which generations were caused by the intervention, or recover unlogged provider serialization. Provider input/cache/output receipts remain authoritative.

## Accounting, reproduction and limits

Original study known cost: $1.026164. Including the corrected follow-up, known API-equivalent cost is $1.158922 plus $0.399330 retained for unknown usage: total consumed/reserved $1.558252 of the shared $4.50 cap. With prior campaigns ($1.000582), cumulative consumed/reserved is $2.558834 of $8. Original schedule unrun: 0; correction unrun: 6. No unreported retries or model substitutions. One original worker null is reconciled from complete matched reservation/settlement IDs after an explicitly pre-dispatch budget error; the original raw null remains. The provider-503 unknown remains unknown and retains its entire reservation. Estimates use the frozen catalogue, not subscription invoice billing.

Every request is reserved before dispatch using serialized UTF-8 bytes plus 4,096 framing tokens and the highest catalogue input/output tiers. Known usage reconciles the reservation; unknown usage retains it and stops the campaign. 0 original and 1 corrected attempts have unresolved unknown total cost. See both complete ledgers, transcripts, test outputs, patches and per-run results under `implicit-semantic-v1/` and `implicit-redux-corrected-v1/`.

Frozen archive: `3f2b1b25fb8ab5745577a0e72b15733d09dcc5e454c16a67aac80a2eb568c21b`. Independent replay verified 127 exact entry hashes, 23 exact Git source blobs and 14 source blobs differing only by checkout CRLF conversion. All 24 recorded patches were regraded from archived snapshots; all outcomes agreed. Exact task bytes remain in the compressed archive.

Run `node scripts/fetch-implicit-sources.mjs`, `node scripts/prepare-implicit-benchmark.mjs`, then freeze/commit before a new campaign. Archives replay without inference with `node scripts/verify-implicit-archive.mjs reports/implicit-semantic-v1 FRESH_REPLAY_NAME` and `node scripts/verify-implicit-archive.mjs reports/implicit-redux-corrected-v1 FRESH_CORRECTED_REPLAY_NAME`; each replay directory must be new. The historical preparation script intentionally reproduces the original snapshot, including its documented config omission; use `implicit-redux-correction.mjs --prepare` for the corrected input. `implicit-results.mjs` audits receipts and `implicit-report.mjs` renders this report. Paths in the trusted public loader/test permissions reflect the recorded Windows workspace and TypeScript install; relocating requires explicitly remapping that public dependency path and reporting the change.

Analysis CPU/heap samples belong to the shared parent process and include tokenization, retrieval and compiler work; graph-only peak memory and subprocess CPU are not isolated. Initialization/update metrics are subsets of elapsed layer cost. The all-file byte metric includes documentation and test reads as well as production source; the production-only metric separates those. Read counts describe successful completed reads; raw attemptedTools and total tool calls retain failed calls. Source bytes include line numbers and repeated snippets; graph text is accounted separately in packet/provider tokens. Packet replay counts each retained packet in later generations, without assuming cache discounts or additive correspondence to provider tokens.

The cohort is small, historical and potentially present in model training data. It omits full upstream suites and production environments; the standalone Redux migration is only 1,546 source lines. No energy measurement, statistical significance or generalization claim is warranted. No activation implies no graph-treatment test on that particular attempt; abstentions remain part of the intention-to-treat result. The frozen budget, ranking and conservative byte cap were not tuned after observing model behavior.

## Validation and source revisions

Final implementation tested at `c1f69b931449f970afc50b66bb76cb5170bcf846`: 124 repository tests and six CLI tests passed. The original scored implementation is `0c3132520d5ab2a8be57d15bd58b9dbfd16c8f15`, distinct from later safety hardening. The local-rename fix requires complete fresh binding renames and rejects reference substitutions, collisions, eval and observable anonymous-function naming changes; offline replay changed zero of 60 original edit-batch classifications. A later native-read integration fix respects actual full/default/byte-truncated spans and abstains if the ordinary tool returned no source. Research attempts use the separately structured file_read span; no model attempts were rerun for these safety fixes.

All 24 original and both corrected patches were independently replayed from their frozen input archives with grading outcomes agreeing. Original execution-input verification checked all 37 hashes unchanged at the end of scoring. The corrected archive independently verifies 63 entries and its source commit; original archive verifies 127 entries. Credential scans compare actual local auth values in memory, including decoded archived files, and print no secrets.

## Compiler-configured Redux correction (separate, incomplete)

Correction source freeze: `7e67be9ccb88eec447c7f3485437f75f72474856`; execution: `18c6a4b37d9afb30c8a519915897922fbc655bff`. Production source, task prompt and grader bytes are unchanged; the original upstream tsconfig is added. This follow-up was frozen after the configuration defect was diagnosed and was announced before inference, with no model-setting changes or favorable rerun selection. It uses the same $0.50 attempt reservation ceiling and carries the primary study's consumed budget into the shared $4.50 cap.

| Metric | Baseline | Compact AST | Implicit semantic | Semantic + impact |
|---|---:|---:|---:|---:|
| Executed / scheduled | 0/2 | 0/2 | 1/2 | 1/2 |
| Accepted / executed | unrun | unrun | 1/1 | 0/1 |
| Known complete mean cost | unrun | unrun | $0.089117 | unknown |
| Packets delivered | 0 | 0 | 8 | 13 |
| Source-validated novel facts | 0 | 0 | 11 | 16 |
| Observed input tokens | unrun | unrun | 79865 | 30605 |
| Requests dispatched | unrun | unrun | 7 | 5 |

The first semantic attempt passed and delivered eight packets, versus one in its original counterpart. Its estimate rose from $0.057777 to $0.089117. That is evidence of stronger actual treatment, not a causal comparison across phases. The next semantic+impact attempt delivered 13 packets before HTTP 503 / subscription_sharing_user_unavailable left request usage unknown. Its partial patch fails both graders. The frozen rule retained $0.399330 and stopped before the other six scheduled attempts. The failure cannot be interpreted as graph-caused correctness loss. Observed input/output on that errored attempt are known lower bounds, not complete consumption. There is no corrected four-arm comparison or completed secondary configuration-valid cohort; the original 24 are never replaced or pooled silently.

## Explicit answers and recommendation

1. **Source exploration:** C averages 7.67 production reads versus 8.17 baseline (-6.1%), but production bytes change by only -1.1% and all-file bytes rise 0.2%. Search calls also rise. D does not reduce production read count. This is a small mixed change, not strong evidence that packets replaced exploration.
2. **Model calls:** No reduction. Baseline/C/D mean dispatched generations are 5.33/5.67/5.50. Intervention code dispatches no helper generations. Attribution of later generations to individual packets is not identifiable.
3. **Input tokens:** No reduction: C 18.4%, D 10.2%, AST 24.9% versus baseline, including cache. Smaller source reads do not establish lower total context.
4. **Cost per accepted task:** The original descriptive values are baseline $0.049278, AST $0.042511, C $0.043111, D $0.044340. Assisted acceptance differs from baseline; one baseline TS2352 generic-conversion error remained when its next request hit the conservative reservation ceiling. These are not efficiency estimates at matched correctness. On Ky+Immer, where all arms passed and graph resolution activated, mean costs are baseline $0.034889, AST $0.034643, C $0.035528, D $0.038419. This descriptive task breakdown preserves all failures in the primary table.
5. **Correctness on difficult multi-file work:** All assisted original arms passed both Redux migrations versus one baseline failure. AST matched semantic acceptance. Original Redux type resolution was weak, and the corrected comparison is incomplete, so there is no demonstrated semantic-specific correctness gain.
6. **Task concentration:** Ky shows near-equal baseline/AST/C costs and higher D cost. Immer emits genuine calls/dependencies but still requires substantial source reads, with no clear inference saving. Strong cross-module Redux contracts activate only in the corrected follow-up, which cannot support an arm comparison.
7. **Abstention:** C returns no packet for 46/61 observed triggers, including disabled/irrelevant events; after actual bounded expansion it abstains 19/34. D: 30/63 overall and 23/56 expanded. Reasons and every affected source/symbol appear in raw logs. Original disabled-edit reasons sometimes record change kind; later hardening names impact_disabled explicitly.
8. **Redundancy and utility:** Independent replay found zero previously available or duplicate delivered source facts. That does not establish utility: some packets offer declaration headers, generic utilities or even a comment opener. D emits 16 verification plans, 10 repeating the same generic instruction across regions, and 10 plan-only packets. No original plan names specific tests because the adapted offline loader hides static links. Targeted verification efficiency remains untested.
9. **Cached impact:** D reuses 226 cached file analyses and bounds updates, but averages 851 ms analysis-layer CPU versus C 574 ms, and 2.9% more mean inference cost without an original acceptance gain over C. It does not demonstrate a benefit. Generic repeated plans are an identified context-inflation weakness.
10. **Simpler AST alternative:** AST matches original semantic correctness with slightly lower mean inference cost ($0.042511 versus $0.043111). It abstains entirely on Immer. This supports keeping a simpler baseline/AST alternative in future comparisons, not enabling AST by default from six trials.

**Recommendation:** Keep all automatic flags opt-in. The passive implementation removes mandatory graph interactions and delivers bounded, source-verified evidence, but this cohort does not show that the graph reliably removes enough model work to justify its added context and computation. Treat generic verification repetition, weak task relevance and compiler-configuration eligibility as prerequisites before another study. Prefer a simpler baseline or narrow AST retrieval unless stronger held-out evidence establishes an incremental graph benefit. Do not claim the incomplete corrected TypeScript comparison or targeted test selection succeeded.
