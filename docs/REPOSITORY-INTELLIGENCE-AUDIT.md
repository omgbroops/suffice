# Starting architecture audit

Base: `codex/suffice-cli-alpha`, `124e0e194d526064a6b66b951faf4c4d64853f5a`.
The user subsequently instructed us to ignore prior graph trial branches. Neither
`codex/semantic-graph-impact-v1` nor `codex/implicit-graph-workflow-v1` is inspected,
merged, or used as implementation input. This supersedes the original branch audit request.

## Existing code and reuse decisions

| Area | Owning paths | Behavior and limitations | Decision |
|---|---|---|---|
| Parsing/navigation | `packages/cli/src/navigation.mjs`, research copy `src/symbol-navigation.mjs` | Acorn + acorn-walk, Node TypeScript stripping, function/class/binding ranges and syntactic identifier matches; per-file SHA-256 cache. No lexical binding resolution; no tree-sitter dependency or integration found. JSX unsupported. | Share the CLI parser entry point; retain AST navigation and all three existing tools. |
| Dependency graph | `src/code-graph.mjs`, `src/harness.mjs` | Lexical scanner extracts imports/requires, resolves relative paths, BFS plus lexical ranking. Not a symbol graph; rebuilt for a research run and not refreshed after edits. | Preserve research harness. Reuse the small in-process adjacency/BFS approach conceptually, without treating importers as exact callers. |
| Tools/execution | `packages/cli/src/tools.mjs`, `packages/cli/src/session.mjs` | Native Pi read/edit/write/bash plus navigation, registered as custom tools inside codemode. Repository path guards, bash timeout, task allowance and receipt logging. | Add three custom graph tools through the same registration; do not replace execution or codemode. |
| Agent/context | `packages/cli/src/session.mjs`, `interactive.mjs`; research `src/real-agent.mjs`, `context-policy.mjs`, `watchers.mjs` | CLI uses fixed general-v1-derived prompt, resource loader with AGENTS.md, normal session context; research pruning/watchers are separate. No automatic graph controller in the alpha CLI. | Keep default prompt/tools identical. Optional guided extension supplies bounded initial evidence and post-tool edit impact/test evidence. |
| Edits/cache | `packages/cli/src/workspace.mjs`, `navigation.mjs`, `tools.mjs` | Scoped path checks; nonhidden nonsymlink traversal excluding node_modules. Hash on navigation read, memory cache; no persistent graph or shared edit invalidation. Shell edits bypass native edit hooks. | Content-manifest validation on every graph query, including shell/external edits and deletion; persist file analyses outside repository under CLI home. |
| Verification | `packages/cli/test/cli.test.mjs`, `tests/*.test.mjs`, `src/workspace.mjs`, `benchmarks/tasks.mjs`, `benchmarks/verify-tasks.mjs` | Node tests; CLI integration tests without inference. Frozen synthetic workspaces, separate acceptance tests, strict TAP grading and immutable-input checks in research runners. No test coverage graph. | Reuse CLI session and strict test runner in a separate three-arm comparison. Test recommendations are conservative static import reachability, never a proof of coverage. |

## Minimum vertical slice

Persistent per-file Acorn analysis, lexical identifier bindings, named/default ESM
exports and explicit reexports, symbol/reference/call/module evidence, content
versions and revision identity, query-time invalidation, symbol change detection,
reverse dependency impact and test recommendation, three CLI tools and an opt-in
guided extension. No service, graph database, harness rewrite, or removed AST tool.

Exact relationships will be limited to supported lexical syntax and unambiguous
explicit module paths. Dynamic dispatch, computed imports, wildcard exports,
CommonJS bindings, aliases configured outside source and unsupported syntax must
remain visible limitations. Resolved syntax does not establish runtime execution
or behavioral correctness.
