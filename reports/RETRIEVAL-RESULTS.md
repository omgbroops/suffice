# Offline repository retrieval results

No method dominated. Increasing the context ceiling improved coarse file recall, but every arm still missed all repair hunk lines for two parser issues. Selecting the right filename is insufficient evidence of useful repair context. There were no model calls ($0 benchmark inference), coding patches, live acceptance tests or capability claims.

| Ceiling (estimated units) | Arm | Mean file recall | All labeled files | Mean hunk coverage | Mean used units |
|---|---|---:|---:|---:|---:|
| 4096 | Lexical | 66.7% | 3/5 | 30.0% | 4037 |
| 4096 | AST | 80.0% | 4/5 | 28.8% | 3682 |
| 4096 | Dependency | 66.7% | 3/5 | 32.2% | 4074 |
| 4096 | Hybrid | 63.3% | 3/5 | 25.6% | 4040 |
| 8192 | Lexical | 90.0% | 4/5 | 46.9% | 8094 |
| 8192 | AST | 83.3% | 4/5 | 43.4% | 5579 |
| 8192 | Dependency | 90.0% | 4/5 | 35.6% | 8172 |
| 8192 | Hybrid | 90.0% | 4/5 | 46.9% | 8145 |

Budget is ceil(UTF-8 packet bytes / 3), including headers; it is not a model tokenizer. A 4096-unit result is not guaranteed to fit 4096 actual model tokens. AST often underfills because matching names produce few candidates. Therefore these compare equal ceilings, not equal exact context consumption.

The five independent original issue queries were [picomatch #62](https://github.com/micromatch/picomatch/issues/62), [#142](https://github.com/micromatch/picomatch/issues/142), [#187](https://github.com/micromatch/picomatch/issues/187), [#58](https://github.com/micromatch/picomatch/issues/58), and [fast-glob #499](https://github.com/mrmlnc/fast-glob/issues/499). Source revisions are pinned in the frozen manifest. Original issue bodies, rather than PR solutions, supplied all query terms. Bodies are the versions fetched today; historical issue edits were not reconstructed, and some reports include useful diagnosis or stack traces. This is legitimate report evidence but does not guarantee an untouched historical query holdout.

Specific failures:

- Picomatch #142 (parenthesized terminal globstar) retrieves no parser chunk at 4K for lexical/dependency/hybrid. AST retrieves parser chunks but misses the repair hunk. At 8K every arm retrieves the file and still misses every repair hunk line.
- Picomatch #187 (POSIX bracket negation) has its parser file retrieved in every arm/budget, yet hunk coverage is zero everywhere. Large parser files contain many candidate definitions; ranking a generic `parse` symbol cannot localize the responsible branch.
- Picomatch #58 has 100% scan-file recall everywhere. At 8K lexical/AST/hybrid cover all hunk lines; dependency covers only 43.75%. Import-neighbor promotion consumes useful intra-file coverage. At 4K hybrid covers 10.94%, compared with 32.81% lexical and 43.75% AST/dependency.
- Fast-glob #499 touches async/stream/sync providers plus their src-contained tests, six labels total. At 4K lexical/dependency cover 2/6 files, hybrid 1/6, AST 0/6. At 8K lexical/dependency/hybrid cover 3/6, AST 1/6. No arm covers all six. These labels include tests; they are not six production repair files. All filenames/ranges are available in JSON, so production/test distinctions can be audited without changing the primary score.
- Picomatch #62 is easy localization: every method covers the entire repair hunk at both budgets.

Source-only corpus spans three revisions: two picomatch snapshots of five lib files each (61,125 and 61,895 bytes), and fast-glob's 84 src files (219,702 bytes, including tests). Acorn/current TypeScript stripping fails on three fast-glob files (`src/tests/utils/errno.ts`, `src/utils/pattern.ts`, `src/utils/stream.ts`); lexical remains available but AST and import edges are incomplete there. Dependency expansion is one-hop syntactic imports, not resolved semantic relationships. No extra embeddings, summaries or query model were used.

This pilot does not support replacing lexical retrieval with the hybrid policy. It supports a follow-up using query-driven within-definition pagination and demand-driven expansion, measured on new issues with independent semantic labels. Avoid selecting a policy from these five scores and calling the same set a holdout. Main A/B/C source and runtime were not modified.

Validation: five policy tests pass (UTF-8 budget accounting, hard ceilings/oversized-unit skipping, forward/reverse import resolution, parse-failure visibility and label-independent deterministic ranking). Forty packets retain selected file/line ranges and budget utilization. Freeze integrity passed before and after scoring. Results are deterministic apart from timing; timing has no causal interpretation under concurrent jobs. The protocol, implementation, full JSON and receipts remain in this worktree. No source/test acceptance was executed on historical defects or reference patches, and repair hunk labels are proxies, not validated minimal necessary evidence.

Run `node --test experiments/retrieval/policy.test.mjs` and `node experiments/retrieval/run.mjs` from this worktree. Read [protocol](RETRIEVAL-PROTOCOL.md) before rerunning acquisition or freezing: existing source/query/label bytes are the reproducible campaign inputs. Frozen artifact SHA and exact per-task results are in [JSON](retrieval-results.json).
