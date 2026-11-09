# Repository intelligence v1 (experimental)

Start with the [architecture audit](REPOSITORY-INTELLIGENCE-AUDIT.md). The alpha
agent, native tools, Acorn navigation, codemode, model selection, task allowances,
and session handling remain in place. The default mode is `off`.

```sh
node packages/cli/bin/suffice.mjs --intelligence tools --print "repair this issue"
node packages/cli/bin/suffice.mjs --intelligence guided --print "repair this issue"
node packages/cli/bin/suffice.mjs --intelligence on-demand --print "repair this issue"
```

`tools` adds `get_symbol_context`, `get_impact_analysis`, and
`get_relevant_tests`. `guided` adds the same tools plus initial context selection
and post-edit impact/test evidence. `--model gpt-6.1-sol` is the existing default.
All modes preserve read, edit, write, shell, grep, and the existing navigation
tools. These remain necessary when static analysis abstains.

## Schema and evidence

Implementation is under `packages/cli/src/intelligence/`:

* `parse.mjs` shares `parseJavaScript` from existing `navigation.mjs`. It performs
  two passes: declarations/scopes first, uses second. TypeScript uses Node's
  existing type-stripping support, preserving source positions.
* `graph.mjs` links per-file analyses, stores snapshots, computes changes and
  reverse module reachability, and exposes the three query operations.
* `tools.mjs` adapts these operations to the existing TypeBox tool interface and
  the existing Pi lifecycle hooks.
* `source-files.mjs` filters ignored untracked artifacts when the workspace owns
  its Git root; tracked files remain included. Parent Git metadata cannot hide
  an entire nested workspace. Configuration metadata is versioned separately.
* `module-resolution.mjs` lazily uses pinned TypeScript compiler module-path
  resolution for configured TypeScript sources. It does not replace Acorn or
  construct a full compiler program.

Schema version 2 consists of:

| Structure | Fields and meaning |
|---|---|
| File | Repository-relative path, SHA-256 content version, optional parse/read error. |
| Symbol | ID, name, kind, path, line range, declaration-content hash; optional explicit import binding. IDs combine path, named lexical ancestry, declaration kind/name and disambiguating ordinal, without line offsets. |
| Module node | `module:<path>`, one per analyzed file. |
| Relationship | `defines`, `module`, `exports`, `imports`, `reference`, or `call`; source and target IDs, resolution status, evidence, optional import/reexport evidence chain. |
| Evidence | Source path, line/column when available, source content version, syntax kind. Every resolved relationship has source evidence. |
| Unresolved | Syntax/name/specifier when available, source evidence, explicit reason; no invented target ID. |
| Repository revision | Git HEAD, source-content version, configuration version and combined content version. HEAD alone is insufficient for dirty files. |
| Change record | Stable symbol ID, path/name, added/deleted/modified classification relative to task-start baseline. File changes are also tracked independently. |

References and calls resolve **lexical bindings**, not runtime function values.
A resolved call cannot prove execution, dispatch, behavior, or a successful edit.
Explicit named/default imports and named reexports follow export bindings across
files. Import aliases do not collapse unrelated same-name declarations. Cycles
terminate with abstention. Existing literal implementation paths retain priority.
Configured TypeScript sources can also resolve extensionless paths and aliases
using their nearest in-workspace `tsconfig.json`, with compiler/configuration
provenance. NodeNext import/require mode follows package metadata. Unsupported
extends/plugins, declaration-only targets and paths outside analyzed files abstain.
JavaScript implicit paths and unconfigured aliases remain unresolved.

Impact arrays expose totals, omissions and pagination. Relevant-test traversal
uses the full internal reachability result before limiting returned candidates.

Impact is deliberately conservative at the **module level**. Reverse traversal
marks consumers as `inferred`, with a dependency witness chain. It includes the
task-start graph for removed imports/files, identified by historical file hashes
and `baselineRevision`. This is potential impact, not a symbol-level proof that
all importers depend on the changed behavior. Test recommendations filter that
reachability by test-directory/file naming conventions. They do not establish
test coverage or the correct runner; use project configuration and the full suite.

## Persistence and invalidation

The engine stores serialized file analyses in
`<CLI home>/intelligence/<SHA-256 canonical repository path>.json`, outside the
repository. The cache is schema-, repository-, and Node-version-bound. Atomic
temporary-file replacement avoids partial JSON writes. Cache read/write failure
is logged; a missing/corrupt cache can be rebuilt. No credentials are stored in
the index.

Every query enumerates and hashes current supported source and configuration contents, reusing
unchanged analyses and parsing changed/new files. Deleted files disappear from
the current graph. A second content scan detects edits during indexing and
rejects that query rather than returning known-stale results. An unchanged
manifest/revision reuses linked relationships. Queries serialize within one
engine instance. Configuration-only changes relink cached source analyses and
conservatively seed affected TypeScript files. Independent processes can safely overwrite a cache snapshot;
their next queries still revalidate contents.

Native edits, shell edits, file renames, additions, deletion, and edits preserving
timestamps all take this path. No filesystem watcher or exclusively native edit
hook is required. Like any read snapshot, a result can become outdated immediately
after validation; callers can compare returned file hashes with subsequent reads.
There is no filesystem transaction or lock against external writers.

## Agent integration

`session.mjs` creates the optional engine and passes it to `repositoryTools`.
Default sessions create no engine or graph extension and retain the original
prompt/tool set. The optional extension snapshots the task-start state at
`before_agent_start`. Guided mode reads a bounded README contract, ranks symbols
by lexical task/README overlap, and injects a bounded evidence message. Ranking
is a heuristic and explicitly marked as such.

After a top-level codemode/edit/write/bash result, guided mode refreshes the
graph. A new content version appends changed-symbol, potential-impact and test
evidence to the result, preserving its existing programmatic value. It does not
run or claim tests on the model's behalf. Ordinary tool results and fallback
search remain available. Graph errors are logged and guidance falls back without
blocking normal implementation. New user tasks reset the change baseline;
resumed history is not treated as the baseline for earlier edits.

On-demand mode uses the triggers documented in the
[v2 evaluation](REPOSITORY-INTELLIGENCE-EVAL-V2.md), recording reasons and version
scan overhead. If first activation follows opaque shell edits, it cannot recover
every pre-edit symbol relationship that was never indexed. Explicit path seeds
and fallback investigation remain necessary in that case.

## Evaluation and reproduction

The following commands describe the original v1 calibration. The newer
[real-issue protocol](REPOSITORY-INTELLIGENCE-REAL-V3.md) uses A off, B guided and
C on-demand, with Luna/xhigh. Its raw records and corrected source-binding
measurement are separate from the original experiment.

```sh
node --test tests/*.test.mjs packages/cli/test/*.test.mjs
node scripts/intelligence-information.mjs
node scripts/intelligence-benchmark.mjs --campaign=unique-name
# Optional: --auth-home=PATH --tasks=dependency-aliases,cursor-pagination,layered-config
#           --repetitions=2
```

Information retrieval uses four independently stated alias/shadowing/ESM
usage-site oracles in `benchmarks/intelligence/information.mjs`. It compares the
existing syntactic reference tool, existing literal search implementation, and
resolved graph edges. This measures a particular deterministic retrieval task;
it does not model a baseline LLM inspecting source and resolving candidates.

The agent comparison uses the **actual CLI session factory** in all three arms:
A off, B tools available, C guided. It freezes implementation/input hashes,
uses identical task prompts, requested model, effort, cost/time/tool/turn
allowances, rotates arm order across tasks, and keeps acceptance tests outside
the worker workspace. Every original non-src file is checked after execution.
It grades original visible tests and frozen acceptance independently of the
agent's final claims, records actual model IDs and all reported usage, and keeps
patches, tool-call receipts, test output, and graph overhead. Provider failures
or unknown usage are retained; unknown usage stops further inference. Raw full
session/event logs and frozen source copies are under `.suffice/intelligence-runs/`;
reviewable results are under `reports/repository-intelligence-v1/`.

The existing fixture verifier now handles CRLF/LF when applying its externally
stored reference replacements. It still requires exactly one match, preserves
the workspace's line-ending style, and never changes acceptance tests.

## Limits and next experiments

Only nonhidden, nonsymlink JavaScript/TypeScript files up to 128 KiB participate;
the existing traversal excludes node_modules. JSX/TSX, non-strippable TypeScript,
and parse/read failures are reported through coverage. There is no language
server, full semantic type checker, runtime instrumentation, or dependency
installation. Compiler module-path resolution is limited to the configured
TypeScript subset above. Methods are definitions but property calls, prototype
dispatch, computed access, CommonJS bindings, wildcard exports, dynamic imports,
default-parameter initializer uses, and direct eval/with contexts abstain. Globals and external packages are
unresolved; they may be harmless builtins, not index failures.
Type-only TypeScript relationships are removed by stripping and are not indexed.
Oversize/unreadable files have no content analysis, so edits within those files
can require explicit path seeds and fallback search rather than automatic symbol
change detection.

IDs remain stable across line shifts and body edits in a named scope. Renames,
moves, or inserted anonymous/block scopes can change IDs. Declaration text hashes
can flag formatting changes and enclosing functions when a nested declaration
changes. Top-level side effects and export-list-only changes are captured by
file changes even when no symbol hash changes. No rename inference is attempted.

Content validation is O(total analyzed source bytes) per query; parsing is
incremental, linking is reused for unchanged revisions and rebuilt on changes.
Reverse reachability currently scans module edges rather than maintaining a
dedicated reverse index. This favors a small auditable implementation over large
repository throughput. Metrics report latency, parsed-file count, serialized
cache/graph bytes, and noisy net heap delta; a negative heap delta reflects GC,
not negative memory use. See the actual evaluation report for measured values.

Keep the feature off by default. Next, use unseen real-repository issues with
aliases, shadowing, reexports and multiple plausible consumers; compare grounded
repository answers separately from accepted patches. Increase paired repetitions
with randomized order and known budgets. Record whether B actually invokes graph
tools and whether C's evidence is consumed. Include negative tasks with dynamic
dispatch and configured module paths, and measure abstention/coverage as well as
precision. Only then decide whether extra context, indexing and token cost buy
enough successful engineering to justify wider integration.
