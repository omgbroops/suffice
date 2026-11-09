# Repository intelligence v1: measured evaluation

Branch: `codex/repository-intelligence-v1`, based directly on `codex/suffice-cli-alpha` at `124e0e194d526064a6b66b951faf4c4d64853f5a`. Prior graph trial branches were excluded at the user’s instruction. See [architecture audit](../../docs/REPOSITORY-INTELLIGENCE-AUDIT.md) and [implementation/schema/limits](../../docs/REPOSITORY-INTELLIGENCE.md).

## Conclusions

The graph improves automatic binding-usage retrieval on the four deliberately scoped alias/shadowing fixtures. This does **not** establish more successful software engineering. All three agent configurations passed the three small synthetic repair tasks. Optional graph tools were not invoked; guided context was delivered, with additional input tokens and cost. Keep the feature opt-in.

## Repository information accuracy

Ground truth is nine independently authored cross-file binding usage sites across four ESM fixtures, including imports/reexports and identifier uses. Results are micro-averaged after deduplicating path/line sites and excluding the defining file.

| Retrieval method | Correct sites | False candidates | Missed sites | Precision | Recall |
|---|---:|---:|---:|---:|---:|
| Existing AST reference candidates | 1 | 4 | 8 | 20.0% | 11.1% |
| Existing literal search | 4 | 12 | 5 | 25.0% | 44.4% |
| Resolved graph relationships | 9 | 0 | 0 | 100.0% | 100.0% |

These fixtures intentionally exercise supported aliases, unrelated same-name bindings, default imports, and explicit named reexports. The existing AST tool advertises candidate references, not resolved semantics. A baseline LLM could inspect source and manually resolve them; this automated retrieval score does not measure that reasoning. Four authored cases cannot establish general repository accuracy or completeness. Dynamic/unresolved cases are exercised separately in engineering tests. [Exact sites, oracles and timings](information.json).

## Successful engineering comparison

Scored campaign: [sol-final-v1/manifest.json](sol-final-v1/manifest.json). 9/9 scheduled attempts completed. Requested and observed model: **gpt-6.1-sol**, effort **low**. Each task/arm used the same prompt, initial files, frozen acceptance, and allowances: 180s, $1 API-equivalent, 60 turns, 240 tool calls. Arm order rotates across tasks. No auxiliary LLM is used.

| Mode | Accepted + completed | Mean agent seconds | Fresh input | Cached input | Output | API-equivalent total | Graph calls | Guided messages |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| A: off | 3/3 | 31.13 | 14684 | 16384 | 2908 | $0.06009 | 0 | 0 |
| B: tools | 3/3 | 31.17 | 13804 | 21120 | 3138 | $0.06110 | 0 | 0 |
| C: guided | 3/3 | 26.93 | 24019 | 58240 | 2713 | $0.08099 | 0 | 6 |

B vs A: mean agent elapsed time 0.1%; total API-equivalent cost 1.7%; total input including cache 12.4%.

C vs A: mean agent elapsed time -13.5%; total API-equivalent cost 34.8%; total input including cache 164.8%.

Completion requires a normal agent finish, original visible tests, frozen acceptance, unchanged non-src files and matching actual model ID. Patch acceptance is also recorded independently. Elapsed time includes session setup, graph work and agent execution; evaluator grading runs afterward. Acceptance stdout, patches, final answers and usage receipts are retained per attempt. Costs are catalog API-equivalent estimates from subscription usage, **not invoices**. Fresh and cached input are separate and never added to provider total a second time. Engineering work outside benchmark sessions is excluded.

| Task | A off | B tools | C guided |
|---|---|---|---|
| dependency-aliases | [pass](sol-final-v1/1-dependency-aliases-A-r0.json) | [pass](sol-final-v1/2-dependency-aliases-B-r0.json) | [pass](sol-final-v1/3-dependency-aliases-C-r0.json) |
| cursor-pagination | [pass](sol-final-v1/6-cursor-pagination-A-r0.json) | [pass](sol-final-v1/4-cursor-pagination-B-r0.json) | [pass](sol-final-v1/5-cursor-pagination-C-r0.json) |
| layered-config | [pass](sol-final-v1/8-layered-config-A-r0.json) | [pass](sol-final-v1/9-layered-config-B-r0.json) | [pass](sol-final-v1/7-layered-config-C-r0.json) |

The B runs test the effect of **availability**, not actual tool consumption: zero graph invocations means they provide no estimate of graph-query effectiveness. C automatically injected initial and post-edit evidence; actual saved session transcripts also contain these messages. No arm proves static relationships preserve behavior. These previously used AI-authored tasks are tiny and all arms reach the acceptance ceiling; one run per task is insufficient for performance or efficacy inference. Provider cache warmth and service latency were not controlled.

### Earlier attempts retained

`sol-small-v1` stopped at credential preflight without inference. `sol-small-v2` completed nine attempts before final scope hardening: all arms accepted 3/3; no graph tool calls. Default-parameter initializer abstention, class static-var isolation and class-name-based scope identities were then hardened and covered by tests. The scored campaign above reran all nine attempts against the delivered engine. Earlier results are retained in their own directories and are not pooled or silently replaced.

## Engineering validation

The full Node test run is recorded in [tests.txt](tests.txt). Focused tests cover explicit cross-file resolution and provenance, import/reference aliases, lexical shadowing, block/var/destructuring scopes, parameter initializer abstention, class static scope and stable class IDs, edits/additions/deletions/renames, same-timestamp changes, persistent warm caches, corrupt caches, cycles, dynamic/unresolved syntax, parse failures, TypeScript, serialized parallel queries, opt-in tool compatibility, and initial/post-edit guided delivery. Existing CLI and synthetic acceptance/reference checks also pass. The only existing infrastructure adjustment is CRLF/LF normalization in the reference-patch verifier.

## Performance and memory

One local process indexed 187 source files, 5907 symbols and 20380 relationships (9277 unresolved records). Cold refresh: 1111.5 ms, 187 parsed files; unchanged refresh: 506.5 ms, 0 parsed files. Serialized graph: 14.50 MiB; persistent analyses: 9.51 MiB. After explicit GC, retained heap delta was 13.07 MiB; RSS delta 45.30 MiB includes allocator/runtime effects. [Measurement and limitations](overhead.json).

Graph refresh telemetry is also included in every B/C trial result. Query-time content validation still scans all supported source twice, so parsing reuse is not an O(changed files) end-to-end refresh. This prototype favors freshness over large-repository throughput. Single measurements are not latency percentiles; net heap measurements without explicit GC can be negative.

## Remaining limits and next experiments

Explicit runtime ESM syntax only; no type checker or LSP, configured/package module resolution, CommonJS binding resolution, wildcard exports, property dispatch, runtime coverage, or full-language support. Unsupported files and unresolved uses remain visible; inference is not relabeled as exact resolution. Reverse import reachability intentionally overapproximates file impact and can miss consumers behind dynamic edges. See the implementation document for size/traversal, snapshot-race and symbol-identity limits.

Next: paired, repeated unseen real-repository tasks with plausible competing symbols, aliases/reexports, deletion and cross-file contract changes; independently grade grounded repository answers and accepted patches. Include dynamic/unsupported negative controls and measure coverage/abstention. Measure tool consumption, evidence usefulness, total tokens/cost, full-suite verification and larger-repository index overhead. Optimize only if accepted-patch gains justify the extra context and validation cost.
