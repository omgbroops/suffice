# Passive source context (opt-in)

Ordinary reads and edits can invoke deterministic analysis without another model request or specialized tool call:

```
suffice --auto-context
suffice --auto-context --auto-impact --auto-verify
suffice --auto-context --context-mode ast --packet-tokens 400 --context-tokens 1200
```

Each switch is independent. `--auto-verify` suggests checks; it does not execute checks or replace the full suite. Defaults and the existing explicit navigation/graph/recipe APIs remain unchanged. `implicitToolAdapter` also wraps ordinary tools for other harnesses; its Pi bridge must be installed as a `tool_result` observer when `deferToCodemode` is enabled.

The backend identifies exported declarations intersecting the requested/edited span (at most three), inventories the existing compiler graph, and analyzes at most six files within two module hops, considering at most 32 candidates. It prefers direct calls, data flow and type relationships, then references/imports. One test candidate is reserved when possible. Static tests are candidates, never proof that a test covers behavior. Initial compiler source/declaration inventory still scans the admitted repository using the graph's existing file/byte bounds; detailed relation expansion never invokes `allAnalysis()` automatically. Truncated symbol sets and neighborhoods are marked bounded.

Packets contain stable compiler IDs, a source location and a short literal source excerpt, revision prefix, unresolved count, known unexpanded file count and omitted fact count. Full revisions and source references are retained in audit metadata. Syntax mode resolves only direct relative import/export binding candidates using Acorn; it never claims checker-backed calls or types, and does not initialize the semantic graph. Barrel/namespace/external imports can remain unresolved.

Packets are capped with `o200k_base` using pinned js-tiktoken 1.0.21. The Sol catalogue does not specify its exact tokenizer, so an additional conservative UTF-8 byte bound applies to the serialized text-block envelope plus two framing tokens. Both must fit the configured limit (maximum 400). Consequently practical packets are substantially shorter than 400 named BPE tokens. A separate session budget defaults to 1,200 named envelope tokens. Provider input/output usage, rather than these local approximations, determines experimental inference estimates.

The source requested by an ordinary tool is preserved. Automatic evidence is appended as a distinct text block. Under codemode, child results remain untouched; a completed batch receives packets on the outer model-visible result, even if its script projects only `.text`. Reads are coalesced per source path. Edits in that batch supersede intermediate reads, and analysis checks the final snapshot. Every graph/AST snapshot is validated again before delivery; detected concurrent changes cause abstention. There is no transaction spanning arbitrary external writers and model consumption.

Source-line hashes suppress evidence already obtained through reads; stable relation keys suppress delivered evidence across revisions when unchanged. Initial region keys also suppress a stream of previously omitted facts on repeated reads. New relationships and contract changes can justify deltas; repeated implementation edits reuse analysis and do not reprint identical relations. A verification plan is prioritized within edit packets and emitted only when its test/typecheck/uncertainty signature changes. Editing comments or a narrow syntactic local-binding rename abstains before repository expansion. This classifier is conservative syntax, not an equivalence proof; unchanged public signatures never establish correct behavior.

Source/metadata stays in bounded in-memory maps. No persistent graph database or source cache is added. Read buffers are capped at 128 KiB; AST entries 16, regions 64, delivered keys 256, known source lines 5,000, queued calls 32. Existing workspace path/link protections apply to every source retrieval. Repository snippets remain untrusted evidence. Index, parse, tokenizer, stale-source and adapter failures fall back to ordinary operation; successful edits are never gated or rolled back by analysis.

Audit records distinguish proposals from delivery. `implicit_context` records triggers, reasons, roots, expanded files, cache hits, revision, uncertainty, omissions, CPU, latency and observed heap; `implicit_delivery` records the actual appended packet and token delta. No extra inference is dispatched for classification, graph inspection, deduplication or verification planning.

The separate frozen experiment uses ordinary tools in all four arms and fresh Ky, Immer and Redux historical tasks. See `reports/implicit-semantic-v1/manifest.json`, the hash-verified compressed input archive, raw per-run receipts and `reports/IMPLICIT-SEMANTIC-EXPERIMENT.md`. Historical source snapshots and adapted offline checks are independently validated before scoring. Model training contamination and provider cross-session caching cannot be excluded.
