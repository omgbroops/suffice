# Repository information calibration

This measures static source-binding line retrieval separately from agent task success. It uses pinned Axios and Svelte production trees from the disjoint native pilots. No model calls produced the labels or predictions. It is calibration, not a held-out efficacy study.

| Corpus | Tool | True positives | False positives | Missed lines | Precision | Recall |
|---|---|---:|---:|---:|---:|---:|
| axios | Existing AST, scoped fallback | 13 | 0 | 12 | 1.000 | 0.520 |
| axios | Literal source-line diagnostic | 25 | 22 | 0 | 0.532 | 1.000 |
| axios | Repository graph | 25 | 0 | 0 | 1.000 | 1.000 |
| svelte | Existing AST, scoped fallback | 10 | 2 | 20 | 0.833 | 0.333 |
| svelte | Literal source-line diagnostic | 30 | 125 | 0 | 0.194 | 1.000 |
| svelte | Repository graph | 30 | 0 | 0 | 1.000 | 1.000 |

The 23 queries are hash-ordered exported named definitions: eight with cross-file uses and four without where available (Axios supplies only three without). This is a deliberately balanced diagnostic sample, not an estimate over all repository symbols. The same query identities were retained after correcting the oracle.

The independent project TypeScript 2.7.2 checker supplies symbol identities and excludes type-only positions. Its first version overlooked shorthand property values because the checker returns a property symbol; the corrected checker explicitly asks for the shorthand value binding and self-checks that case. `native-information-v4.json` is the final corrected result for this calibration. The adapter also now maps variable declarations to binding/function symbols and checks their definition line range; it previously skipped three negative definitions and five positive reference lines. The 23 selected query identities are unchanged. Earlier v2/v3/v3b files remain historical diagnostics and should not be pooled or quoted as corrected scores.

The engine still uses Acorn lexical analysis. TypeScript 5.9.3 is loaded lazily to resolve configured module paths, without constructing a compiler program or executing plugins. The compiler resolver and oracle share the TypeScript resolver family, so independence is imperfect. Literal existing implementation paths retain priority, and unsupported configurations abstain.

The old engine resolved 9 Svelte relative module edges and left 480 unresolved. The configured resolver resolves 489 in this pinned tree. Two source files remain explicitly unparsed: an angle-bracket assertion in `src/css/Stylesheet.ts` and an enum in `src/utils/CodeBuilder.ts`. These two files remain uncovered by the scored definition sample. The earlier five misses were a query-adapter error for `src/utils/validCalleeObjects.ts`, not a demonstrated parser failure. No runtime or dynamic dependency completeness is implied.

The global AST query aborts on oversized generated files in Svelte (12/12 queries). Its existing per-path API was therefore applied over every production file for scoring, with the existing 80-result cap per file. This is not a resource-matched comparison of tool calls. AST results are candidates for LLM inspection; a syntactic candidate is not a false claim of exact semantic resolution.

Line-level deduplication can hide incorrect individual edges on lines with several references. These scores do not validate every graph edge, dynamic dispatch, anonymous exports, or behavioral correctness.

## Recorded overhead

One sequential local measurement; not a speed comparison. Graph scope includes the entire selected repository tree, while scoring covers production definitions. Cached files and garbage collection make heap deltas approximate.

| Corpus | Tracked source files | Refresh time | Serialized graph | Parse cache | Heap delta |
|---|---:|---:|---:|---:|---:|
| axios | 145 | 3.19 s | 18.8 MiB | 12.8 MiB | 39.5 MiB |
| svelte | 681 | 3.62 s | 22.4 MiB | 14.4 MiB | 74.1 MiB |

The Svelte guided trajectory previously emitted 948,408 bytes of graph guidance, including thousands of generated-output symbols. An offline replay of the same recorded edits with pagination and ignored-untracked filtering returned 6,495 bytes. `payload-replay.json` identifies the intermediate implementation used. This measures serialized evidence volume, not a demonstrated reduction in tokens, model cost, or latency. Source/configuration scans are now separately timed in agent events.

The next experiment uses fresh behavior-focused inputs with identical model budgets and bounded graph output across modes. Old scored trajectories remain tied to their original source manifests and are not regraded as if they used these fixes.
