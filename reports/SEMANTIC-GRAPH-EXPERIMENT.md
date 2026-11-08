# Semantic graph, impact analysis and deterministic recipes

Date: 2026-11-07 (America/Chicago; raw receipts use UTC).

Implemented as an opt-in experiment. Keep semantic navigation disabled by default: this campaign established no efficiency gain, and no agent invoked AST or semantic navigation. All 18 patches passed independent acceptance and visible regression checks. Total recorded API-equivalent inference cost was $0.3704032, with no unknown charges and no unrun attempts. This is not measured subscription billing.

## Revisions and branch

- Base: `124e0e194d526064a6b66b951faf4c4d64853f5a`, fetched `origin/codex/suffice-cli-alpha`. Initial working tree was clean.
- Branch: [codex/semantic-graph-impact-v1](https://github.com/sufficelabs/suffice/tree/codex/semantic-graph-impact-v1), created directly from that remote base; no merge into the original branch or main.
- Scored implementation: `cb60233dc35eff091a2b1bd06c2e2d3b2e45bd99`.
- Frozen manifest/execution commit: `a44cc9e7b061ce0c7a99baebfc113b904dab8e3e`.
- Product correctness follow-up and final microbenchmark source: `28b5a32fae1a83afa8572c0c2d0996dc6fca3e0d`.
- The report/artifact commit is the later branch head. The frozen model campaign was not rerun or retroactively relabeled after the follow-up. No automatic recipe experiment was run.

## Implementation and owning paths

The actual CLI path is bin → main/interactive → session → repositoryTools. Its pre-existing Acorn navigation lives in `packages/cli/src/navigation.mjs`. The lexical `src/code-graph.mjs` and research `src/symbol-navigation.mjs` are outside that active product path and remain intact. The old 24.8% navigation saving belongs to a different historical cohort; it is neither assumed nor compounded here.

- [Compiler graph](../packages/cli/src/semantic/graph.mjs): scoped identities; file/module, function/method, class/interface, binding/parameter/import and type declarations; compiler-resolved imports, aliases, re-exports, namespaces/defaults, shadowing, methods, references, calls, reads/writes, type relationships, direct def-use and potential nonlocal writes.
- [Tool adapters](../packages/cli/src/semantic-tools.mjs): compact bounded symbols, dependencies, callers, impact and candidate-test APIs through existing Pi codemode. `--semantic` is independently opt-in; native tools and Acorn APIs remain available.
- Content hashes detect edits/additions/deletions/renames/configuration changes before requests. A reused TypeScript language service supplies compiler snapshots. Detailed edges are lazy and cached per file. Reverse module and cached semantic dependencies invalidate dependents; unrelated file analysis survives. Declaration/module inventory is rebuilt on changed snapshots. This is file-granular invalidation, not fully incremental per-symbol typechecking.
- Impact distinguishes resolved structural/def-use paths from possible type/behavioral consequences, with source evidence, depth bounds, unresolved possibilities and verification targets. It does not invent a proposed patch or guarantee behavior.
- Tests are associated by resolved references/import paths, conventional test names and JSON/package Jest testMatch patterns. Results distinguish direct, inferred, uncertain and unmapped tests. Whole-suite Istanbul metadata is detected but not treated as per-test coverage. Full-suite verification remains recommended.
- [Recipes](../packages/cli/src/semantic/recipes.mjs): versioned schemas, applicability/pre/postconditions, previews, exact-revision checks, compiler-diagnostic comparison, independent verification, journals and rollback. Implemented resolved rename, explicit import-path update and narrow trailing-literal call migration. Successful operations become untrusted candidates with provenance; inspectCandidate validates the receipt foundation. No patch is automatically promoted.

Runtime bounds are 800 source/metadata files, 12 MiB input, 512 KiB/file, 12,000 visited entries, 30,000 declarations, 100,000 edges and bounded output/depth. Omissions and unresolved relationships are visible. The compiler is loaded only when queried. Bounds constrain admitted input/graph state rather than imposing a hard process heap limit.

Full usage, API shapes, transaction behavior and limitations: [architecture documentation](../docs/SEMANTIC-GRAPH.md).

## Deterministic verification and failures

- `npm test`: **106/106 pass**, including alias/scope/type/def-use/dynamic resolution, deletion/rename, cache freshness, impact/test selection, recipe success/failure/collision/rollback and real Pi codemode integration. [Raw output](semantic-graph-v1/tests-final.txt).
- `npm run test:cli`: **6/6 pass**. [Raw output](semantic-graph-v1/cli-tests-final.txt).
- Installed the actual 44,940-byte CLI tarball outside the source package. Version launch, cross-file compiler callers and a two-file rename preview passed with zero inference. [Package receipt](semantic-graph-v1/package-smoke.json).
- Exact archive extraction verified 183 content hashes plus the inventory, and replayed one recorded accepted patch for each task: original failed, patched acceptance and visible regressions passed. [Replay receipt](semantic-graph-v1/archive-verification.json).
- Credential comparisons against the credential store actually used for the campaign and the repository privacy check found zero leaks. [Receipt](semantic-graph-v1/privacy-check.json).

An existing Windows fixture test initially failed because JSON reference patches used LF while checked-out source used CRLF. The verifier now normalizes only newline representation for its exact unique-match assertion and preserves the checkout style. No acceptance assertion was weakened; all authored task validations pass.

Post-benchmark regression checks exposed three missing dependent invalidation paths (literal dynamic imports, import types and JSDoc imports) and compiler-node maps retained after disposal. The follow-up fixes those paths, follows cached semantic dependencies/reference directives, conservatively invalidates augmentations and releases compiler maps. All four regression cases now pass. The [failing output](semantic-graph-v1/invalidation-before-fix.txt) and [passing output](semantic-graph-v1/invalidation-after-fix.txt) are preserved. These fixes are independent of hidden task outcomes; the scored agents never loaded the graph. Both source revisions remain explicit.

## Frozen experiment

One Pi 1.2.0 research harness runs every arm with the historical scoped read/search/edit/test primitives. AST adds the existing CLI parser navigation; semantic adds only compiler graph/impact/test tools. The same base system prompt, model gpt-6.1-sol, low effort, task instructions, file access, environment, timeout and independent grading apply. Only tool availability/descriptions differ. There are no recipe tools, helper models, context pruning or retries.

Three fixed tasks × two independent fresh sessions × three arms = 18 scheduled and executed attempts. All baseline snapshots failed hidden acceptance and passed visible checks; reference repairs passed both before freezing. The balanced schedule and all source/test hashes were committed before scoring. Tasks were not changed after seeing outcomes:

| Task | Provenance and scope | Production modules |
|---|---|---:|
| prerelease-diff | Reused real npm/node-semver historical function repair; base 753e02b9d0cb3ac23e085dc33efcab3e08d61f2b, upstream fix d588e3782864b1cab2fe9f2452b848e8c7f609d1 | 47 |
| dependency-aliases | Existing authored synthetic repair of exported resolveName and buildOrder caller | 2 |
| inventory-reservations | Existing authored synthetic behavioral contracts across an active module chain and distractors | 15 |

This is not a fresh holdout: two tasks are synthetic and the real historical issue was previously used. Even the larger synthetic workspace has only a few KiB of source. The correctness ceiling and absent navigation uptake make this a weak test of the semantic hypothesis. It should not be presented as evidence of general coding-agent savings.

Workers cannot see graders, reference patches, manifests or grading metadata. They have no shell/network/host API in codemode; scoped file tools expose only their isolated snapshot. Visible tests run in credential-free Node permission subprocesses. Independent acceptance runs after the session and is not fed back to the agent.

A $7.95 shared and $0.75 per-attempt API-equivalent allowance reserves conservative request bounds before dispatch. Input is bounded by UTF-8 payload bytes plus framing at the highest frozen price tier, and output is capped at 4,096 tokens. Known usage releases unused reservation; unknown usage retains its reservation and stops the campaign. All recorded requests had known usage. Invoice costs are not available.

## Recorded comparison

| Metric | Baseline | AST | Semantic |
|---|---:|---:|---:|
| Accepted / completed | 6/6 / 6/6 | 6/6 / 6/6 | 6/6 / 6/6 |
| Mean inference cost / cost per accepted patch | $0.017957 | $0.021462 | $0.022315 |
| Mean input incl. cached tokens | 12554 | 13844 | 15871 |
| Mean cached input | 6763 | 6357 | 8192 |
| Mean output tokens | 570 | 585 | 614 |
| Mean model calls | 4.33 | 4.33 | 4.50 |
| Mean tool calls | 16.67 | 17.50 | 17.00 |
| Mean agent wall seconds | 21.28 | 20.95 | 23.64 |
| Mean wall seconds incl. independent checks | 21.49 | 21.15 | 23.85 |
| Mean files retrieved | 7.83 | 8.00 | 8.00 |
| Mean delivered source bytes | 5079 | 5092 | 5092 |
| Specialized navigation calls | 0 | 0 | 0 |
| Live graph indexing overhead | N/A | N/A | 0: never loaded |

AST availability cost 19.5% more and semantic availability cost 24.3% more than baseline on these recorded means. Semantic mean agent wall time was 23.64s versus baseline 21.28s. No specialized tool was called, and source retrieval did not shrink. These observations do not establish a causal explanation or the cost/benefit of an actually used graph. In particular, zero live graph overhead is lazy non-use, not evidence that indexing is free.

### Per-task means

| Task | Arm | Accepted | Mean cost | Mean tool calls | Mean wall s |
|---|---|---:|---:|---:|---:|
| prerelease-diff | baseline | 2/2 | $0.019332 | 10.50 | 17.81 |
| prerelease-diff | ast | 2/2 | $0.024630 | 11.50 | 16.26 |
| prerelease-diff | semantic | 2/2 | $0.024042 | 11.00 | 21.55 |
| dependency-aliases | baseline | 2/2 | $0.016001 | 13.00 | 26.90 |
| dependency-aliases | ast | 2/2 | $0.017678 | 14.50 | 25.40 |
| dependency-aliases | semantic | 2/2 | $0.018421 | 13.00 | 24.87 |
| inventory-reservations | baseline | 2/2 | $0.018539 | 26.50 | 19.13 |
| inventory-reservations | ast | 2/2 | $0.022078 | 26.50 | 21.19 |
| inventory-reservations | semantic | 2/2 | $0.024481 | 27.00 | 24.51 |

Every attempt, token totals, changed files, source retrieval, CPU samples and grading output are in [RESULTS.md](semantic-graph-v1/RESULTS.md) and [summary.json](semantic-graph-v1/summary.json). There were no immutable-file violations and no independently rejected patches. All six inventory attempts added an own-property guard in stock-repository.mjs beyond the three-file reference repair. This is a discretionary robustness edit; the frozen tests do not establish its necessity. Passing acceptance is not proof of zero unnecessary changes or all possible regressions. [Patch audit](semantic-graph-v1/patch-audit.json).

## Indexing and graph quality

The final 66-file fixture initially indexed in 149.41 ms. Editing the shared export took 45.97 ms and invalidated exactly core, bridge, client and the dependent test. Editing the unrelated module took 48.87 ms and invalidated only that file. Unrelated edge caches survived. Inventory rebuilding and full admitted-input hashing still incur work after local edits; the one-file update is not claimed to scale with only that file.

Four enumerated calls were resolved correctly with zero false positives and zero false negatives; all three expected impacted functions and the one known relevant test were selected. The fixture reported zero invalidation failures. These tiny deterministic denominators are not a production precision/recall estimate. Additional regression tests cover the follow-up import forms and disposal.

| Workspace | Indexed source files | Initial index ms | Lazy relationship expansion ms | Observed heap after MiB | Observed RSS MiB |
|---|---:|---:|---:|---:|---:|
| prerelease-diff | 120 | 446.28 | 740.79 | 84.95 | 276.58 |
| dependency-aliases | 3 | 6.85 | 9.81 | 87.25 | 276.28 |
| inventory-reservations | 16 | 20.82 | 17.10 | 94.26 | 277.02 |

Index/expansion timings are local computation, separate from inference charges. Parent-process CPU excludes test-child CPU. Heap/RSS samples include compiler/runtime allocation and garbage collection, use a shared process, and are not isolated peak or incremental memory guarantees. The raw samples, uncertainty counts and source commit are in [final microbenchmark](semantic-graph-v1/microbenchmark.json); the [scored-source microbenchmark](semantic-graph-v1/microbenchmark-scored-source.json) is preserved separately. Unresolved/external/dynamic relationships remain numerous; absence of an edge is never proof of absence of behavior.

## Unimplemented or bounded capabilities

- No theoretically complete behavior/call/alias model, reflection/runtime-injection resolution or arbitrary computed-property analysis. CommonJS module paths are supported, but some callable aliases remain local binding targets rather than resolved implementations.
- No project-reference build, external-package/standard-library indexing, interprocedural points-to analysis or independent per-symbol incremental compiler recomputation. The bounded host uses noLib, limiting type completeness.
- No per-test coverage attribution, evaluation of executable test-runner configs, automatic targeted-only test execution or proof of test ownership.
- No automatic extraction/trust promotion of recipes, automatic crash-journal recovery or rollback of arbitrary verification-command side effects. Multi-file writes are individually atomic, not a global atomic transaction.
- No inference evaluation of recipes. The primary graph campaign had zero specialized-tool uptake, so it cannot estimate savings from graph-assisted investigation.

## Recommendation and reproducibility

Keep --semantic and --recipes off by default. Do not add a graph database or broader autonomous recipe learning based on this result. A useful follow-up needs fresh, preregistered larger JS/TS tasks with actual navigation demand, independent tests and explicit measurement of tool uptake. It should distinguish optional-tool availability from a separately labeled controlled retrieval intervention, without selecting tasks for favorable arm outcomes.

The [frozen input archive](semantic-graph-v1/frozen-inputs.tar.gz) is 179439 bytes, SHA-256 `22e082931f317006debacc13f0594c3f7cf8fb760180d05a157f7b94ef9ba10e`. It preserves the exact scored compiler/runner, prepared snapshots, graders and original line endings; the candidate workers still receive only their individual workspace directories. In a fresh checkout of the frozen execution commit, install dependencies, extract this archive at the repository root and run `npm run semantic:benchmark` with the matching subscription model/catalog. This starts a new paid-equivalent campaign; it refuses changed inputs, unsupported payloads or an existing campaign directory. No download of reference repairs is needed for that replay. Full steps and limitations are in [SEMANTIC-GRAPH.md](../docs/SEMANTIC-GRAPH.md).

Artifacts include the frozen manifest and task-validation receipts, all 18 transcripts/events/patches/results/independent test outputs, the complete budget ledger, source archive and hash inventory, graph-quality/performance records, test logs, packaged smoke receipt, regression failure/fix evidence and privacy check. Original research artifacts remain preserved.
