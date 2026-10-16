# Offline codemode source printing research

The largest measured source prints are whole file reads, but length is not proof of irrelevant evidence. The conservative immediate research candidate is a reversible presentation change: retain every metadata field and every source character, put metadata in a JSON header, and print numbered source as literal text instead of a JSON string. No runtime implementation or model comparison was performed.

## Scope and reproducibility

Run `node scripts/analyze-printing.mjs` from this worktree. This standalone Node analyzer imports only filesystem, path and crypto APIs. It reads saved transcripts and the existing audit/identity manifest; it never evaluates saved codemode programs, imports the harness, contacts an API, or writes into old campaigns. The companion `PRINTING-ANALYSIS.json` contains aggregate counts and precise local reference IDs, not transcript/source content. Indices in references are zero based (message, content block, newline-delimited emitted JSON line). SHA-256 identifies the original transcript and decoded source. Original source remains in the local saved transcript.

34 attempts and 34 transcripts from evidence-record and nemotron-retrieval reproduce the previously reported newest cohort. All 34 transcript hashes match the supplied manifest. The manifest is a post-audit identity record, not a preregistered freeze. The supplied RESEARCH-FINDINGS, CONTEXT-WASTE-AUDIT and audit script were read to align primitive versus visible-output definitions.

| Measurement | Characters/count |
|---|---:|
| Model responses | 211 |
| Visible tool-result messages | 177 |
| Tool-result text characters | 772,001 |
| Raw nested primitive output characters | 535,386 |
| Raw file_read + symbol_read characters | 436,449 |
| Identified emitted source objects | 158 |
| Decoded numbered source characters | 358,758 |
| Serialized source-object characters | 416,166 |
| Serialization plus metadata difference | 57,408 |
| Same-path, same-version, same-numbered-line repeat characters | 0 |

Raw operation receipts are not added to model-visible text: some output is filtered, duplicated, compacted, includes auxiliary structures, or never emitted. The identified source count covers emitted JSON file_read/symbol_read shaped objects, not search snippets, symbol lists, imports embedded in metadata, arbitrary non-JSON prints, or all source-derived information. Therefore 358,758 is a measured subset, not a complete SOURCE classification. JSON string escaping and metadata are combined in the 57,408 difference; metadata includes valuable provenance, bounds and imports and is not classified as waste.

## Largest trace cases

- Development `evidence-screen-v1/001-pmap-readahead-A-r0`, worker message 5: 23,761 visible characters, including a 19,876-character numbered `src/index.js` read (524 lines, no omissions), serialized as 22,222 characters. Version `35eca85876aa35aac5c7103d59d3bf3fe90c3aef63da8358f1721e521e6bc2bc`. Four assistant responses follow. The same source hash occurs in a different attempt C; that is independent-run duplication, not repeat waste inside an actor. Ordered/unordered scheduling and stop/close contracts can require distant control flow; no line is declared unnecessary.
- Development `live-pilot-v1/01-path-to-regexp-448-navigation-r0`, execution message 7: 16,967 visible characters, including 13,997 from `src/index.ts` lines 1–500 of 670 and 1,576 from another source read. The omitted 170 lines must remain explicit; a bounded read is not a complete contract. Two assistant responses follow the source output.
- Descriptive heldout `live-scored-v1/07-marked-4123-navigation-r1`, execution message 7, block 1, line 5: `_Lexer.inlineTokensInner` prints lines 367–546, 6,934 decoded characters (7,644 serialized), with four imports and 11 symbol lines remaining. This already uses semantic bounds and still has a long contract. There is no saved file version on this symbol result, so unchanged-source overlap is not certified.

Full exact references and decoded-source hashes are in JSON. No private source is reproduced here.

## Deterministic candidates and guardrails

1. **Lossless presentation candidate:** for each identified object, emit `JSON.stringify(metadataWithoutText)`, a newline, and the unchanged numbered `text`. Keep imports, path, version, totalLines, offset, omittedBefore/After, symbol bounds and remaining count. The static representation is 388,896 characters instead of 416,166: 27,270 fewer characters (6.55% of identified serialized source objects; 3.53% of all visible tool-result text). This is formatting arithmetic, not a token/cost saving estimate or evidence of preserved model decisions. Output separators/escaping must be unambiguous and source content must not be interpreted as trusted instructions.
2. **Explicit bounded reads:** choose a symbol/page only from task-relevant navigation evidence, preserve exact path/revision and line bounds, expose omissions and make full surrounding contracts retrievable. Do not automatically remove comments, types, imports, error handling, disposal/update branches or test assertions. No reduction estimate is justified: semantic necessity has not been labeled.
3. **Exact duplicate references:** only replace an identical, version-verified prior result within the same actor with a reference if the original remains available in actual context/history. There are zero confirmed repeat characters under this strict criterion in versioned file-source objects. 63 symbol objects lack version hashes, so the zero does not establish zero partial or unchanged overlap across symbol/file reads. Implementing deduplication now has no measured benefit from this conservative subset.
4. **Selective summaries:** use only as navigation hints retaining stable references and an exact source access path. No model-generated or heuristic summary is established to retain needed contracts. No candidate authorizes deleting append-only history.

## Repeated context and partition limits

The structural append-only exposure proxy multiplies each decoded source length by the number of later saved assistant responses: 1,446,996 source-character exposures versus 358,758 source characters first emitted. This describes potential historical carriage, not repeated reads, wire payloads, tokens, cache misses or avoidable dollars. Compaction/provider serialization and actual request retention are not reconstructed. Cached and fresh input cannot be attributed causally to a single print from this proxy.

The development designation is 11 pilot/screen attempts (48 source objects, 157,594 source characters). The descriptive heldout designation is 23 scored attempts (110 objects, 201,164 characters). These are retrospective campaign-name partitions. Both were inspected for this report, so the 23 attempts are not an untouched test set for future candidate selection; future reliability evaluation needs a fresh freeze and new outcomes. No task-level partition independence, repeated-run independence, semantic equivalence, acceptance improvement, or unchanged decisions is claimed.

## Validation

Analyzer completed offline, parsed all 34 transcripts, and checked every transcript against the supplied SHA-256 manifest. No model calls, saved tool-program execution, installation, dependency/auth changes or frozen-code changes occurred. Reports contain references and aggregates only. New analyzer/report artifacts are far below the 40 MiB bound. The preexisting audit's raw-operation count is reused deliberately; source-object counts are independently extracted from visible message text.
