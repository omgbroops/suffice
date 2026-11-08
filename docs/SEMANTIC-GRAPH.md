# Semantic navigation experiment

Semantic navigation is disabled by default. Use `npx suffice --semantic` for the compiler graph and `npx suffice --semantic --recipes` for explicit verified transformations. Read/search/edit and the existing Acorn navigation API remain available. Neither flag changes the model or adds a helper model, hosted service, graph database or agent runtime.

## Owning paths and implementation

The product path is `packages/cli/bin/suffice.mjs` → `main.mjs`/`interactive.mjs` → `session.mjs` → `tools.mjs:repositoryTools`. Its existing `packages/cli/src/navigation.mjs` uses Acorn plus optional Node TypeScript stripping. That API remains intact. `src/symbol-navigation.mjs` is its research predecessor; `src/code-graph.mjs` is a research file-import graph outside the interactive CLI path. Neither has been rewritten.

`semantic-tools.mjs` loads the compiler only on the first semantic query. `semantic/graph.mjs` uses TypeScript 5.9.3's language service, checker, alias resolution, module resolver and AST, following the [Compiler API guidance](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API). Relationships are not inferred by an LLM or regular-expression symbol matching.

Nodes represent files/modules, functions/methods, classes/interfaces, types/enums, bindings, import aliases and simple parameters. Scoped identities include path, declaration ancestry, kind, name and duplicate ordinal. Unrelated declarations sharing a name remain distinct. Identities survive body edits and position shifts; renaming/moving declarations or inserting same-name siblings can change them. Re-query after these edits.

Edges carry source locations and resolution evidence: imports/exports/re-exports, declarations, references, calls, reads/writes, type dependencies, direct initializer/assignment/return def-use and potential nonlocal writes. The checker resolves ES aliases, namespace/default imports, re-exports, shadowing, statically typed methods, common object destructuring, relative modules and root tsconfig/jsconfig path aliases. CommonJS module paths are resolved; callable aliases retain a local binding target when that is all the checker establishes. Returns are dependency evidence rather than inferred runtime values.

## Incremental consistency and bounds

Every request hashes admitted source/configuration content. Same-size edits, additions, deletions, renames and configuration/package changes invalidate old results. No persistent graph survives a process. Declaration/module indexing is eager; detailed edges expand per file on demand. Direct dependencies analyze one file. Callers, transitive impact and test selection require repository-wide expansion within bounds. Reverse module reachability invalidates changed files and dependents while retaining unrelated module analysis. Ambient/global or compiler-configuration changes invalidate conservatively. The language service reuses compiler snapshots. Declaration inventory/module adjacency are rebuilt after changed snapshots; this is not fully incremental symbol binding.

Defaults: 800 source/metadata files, 12 MiB input, 512 KiB/file, 12,000 visited entries, 30,000 declarations, 100,000 edges, 100 retained update metrics. Hidden/dependency/build/vendor/coverage paths and links are excluded, except bounded `coverage/coverage-final.json` metadata. Omissions, node/edge limits and diagnostics are visible. Retrieval accepts at most 80 results and depth 5. These are input/graph bounds, not a hard process heap quota. Even a cache hit costs O(admitted bytes) for freshness hashing.

Only the root compiler configuration's options are used; project-reference builds are deferred. External packages and standard-library source are not indexed (`noLib`), so external/built-in calls frequently remain unresolved. Dynamic imports/calls, computed access, reflection, runtime injection and monkey-patching have no complete static model. Def-use is direct, not flow-sensitive points-to or whole-program alias analysis. Malformed/unreadable inputs produce diagnostics or visible tool errors; ordinary tools remain the fallback.

## Tools and evidence

- `semantic_symbols({query?, path?, limit?})`: scoped IDs and locations without bodies.
- `symbol_dependencies({symbol, direction?, depth?, limit?})`: bounded evidence paths.
- `symbol_callers({symbol, depth?, limit?})`: resolved call edges.
- `impact_analysis({symbol, change, depth?, limit?})`: signature, return_type, parameters, exports, rename, implementation, mutation or side_effect.
- `affected_tests({symbols, limit?})`: direct, dependency-inferred, uncertain and unmapped tests.

Structural/def-use paths are resolved evidence. Type and behavioral consequences remain possible, requiring verification. A change category does not invent a new signature or predict exact type errors without a concrete patch. Confidence is categorical, never an uncalibrated percentage. Static reachability does not prove safety or runtime behavior.

Tests come from conventional paths and JSON/package Jest `testMatch` patterns. Declared root test commands are recorded without executing them. Executable runner configs and arbitrary regex patterns are not evaluated. Whole-suite Istanbul metadata is detected/versioned, but never treated as per-test coverage. Per-test coverage ingestion is deferred. Targeted tests never automatically replace the full suite.

## Verified recipes

`recipes_search` returns versioned IDs, languages, machine-readable parameter schemas, applicability, preconditions, postconditions, verification and rollback rules. `recipe_apply` previews by default. Application requires `apply: true`, exact `expectedRevision`, valid admitted sources and an explicit independent `{command, args}` verification command. Commands use local user permissions with a 60-second timeout and bounded diagnostics.

- `rename_symbol`: compiler rename spans with prefix/suffix edits; refuses visible binding capture and preserves unrelated names.
- `update_import_path`: exactly one AST import/re-export literal; the new path must resolve to the explicitly selected target module.
- `add_call_argument`: an explicitly supplied trailing JSON primitive at direct resolved calls with exact old arity. A compatible signature must already exist. Non-call, optional, computed, spread, trailing-comma and ambiguous sites fail closed.

Transactions hash-check before writes, journal original/transformed bytes under `.suffice/recipes/`, reject new compiler-diagnostic counts, enforce operation postconditions and run the independent verifier. Failure restores unchanged transaction-owned files. Concurrent edits are preserved as `recovery_required`, with original bytes retained for manual recovery. Files are individually atomically replaced; multi-file application is not filesystem-wide atomic. Prepared journals after crashes require manual recovery. Side effects of verification commands outside transformed files cannot be rolled back.

Success creates an untrusted candidate containing provenance, revision, parameters, patch hashes and verification evidence. `RecipeRegistry.inspectCandidate` checks this validation foundation. Automatic extraction, independent regression generation and trusted promotion are deferred. Successful patches never automatically become trusted transformations.

## Reproduction and benchmark

Run `npm ci`, `npm test`, `npm run test:cli`, then `npm run semantic:prepare`. Commit implementation/tests before `npm run semantic:freeze`, and commit the manifest before `npm run semantic:benchmark`. `npm run semantic:microbenchmark` and `npm run semantic:report` generate recorded measurements. A campaign directory cannot be silently reused or reset.

All three scored arms use one Pi 1.2.0 research harness and historical `workspaceTools` read/search/edit/test primitives, identical prompt/model/low effort/limits, and separate snapshots. Baseline has no navigation; AST adds existing CLI Acorn tools; semantic adds only compiler graph/impact/test tools. This is a navigation ablation within one harness, not a research-versus-interactive comparison. The earlier 24.8% result belongs to another cohort and is not compounded here.

Workers receive no graders, reference patches, manifests or campaign metadata. They have no shell/network tool; file tools are restricted to their snapshot. Visible test subprocesses use Node filesystem permissions and a credential-free environment. Hidden checks execute independently outside the session. Tasks, source/test hashes, schedule and settings freeze before scoring. Two existing synthetic tasks and one reused historical repair form an engineering cohort, not fresh held-out evidence.

Recipes are unavailable in scored arms. Output is capped at 4,096 tokens/request. A shared $7.95 and per-attempt $0.75 API-equivalent allowance reserve worst-case cost before network dispatch using the highest frozen catalog tier, one input token per UTF-8 payload byte plus framing allowance, and the output cap. Known usage releases unused reservation. Unknown usage retains its reservation and stops the campaign. Subscription invoices are not measured. Unexecuted attempts remain unrun; failures and raw evidence are retained.
