# Semantic graph benchmark: recorded outcomes

Implementation: `cb60233dc35eff091a2b1bd06c2e2d3b2e45bd99`. Frozen execution: `a44cc9e7b061ce0c7a99baebfc113b904dab8e3e`. Executed 18/18. Stop reason: none.

| Metric | Baseline | AST | Semantic graph |
|---|---:|---:|---:|
| Independently accepted patches | 6/6 | 6/6 | 6/6 |
| Completed attempts | 6/6 | 6/6 | 6/6 |
| Visible regressions passed | 6/6 | 6/6 | 6/6 |
| Mean total estimated inference cost | $0.017957 | $0.021462 | $0.022315 |
| Cost per accepted patch | $0.017957 | $0.021462 | $0.022315 |
| Mean total input tokens (including cache) | 12554 | 13844 | 15871 |
| Mean cached input tokens | 6763 | 6357 | 8192 |
| Mean output tokens | 570 | 585 | 614 |
| Mean model calls | 4.3 | 4.3 | 4.5 |
| Mean tool calls (parent + children) | 16.7 | 17.5 | 17.0 |
| Mean agent wall seconds | 21.28 | 20.95 | 23.64 |
| Mean wall seconds including independent checks | 21.49 | 21.15 | 23.85 |
| Mean unique files retrieved | 7.8 | 8.0 | 8.0 |
| Mean retrieved source bytes | 5079 | 5092 | 5092 |
| Mean retrieved source lines | 110 | 110 | 110 |
| Mean changed files | 2.3 | 2.3 | 2.3 |
| Graph lookup calls (total) | 0 | 0 | 0 |
| Mean graph indexing/update ms | N/A | N/A | 0.00 |
| Mean graph tool ms including import/hashing/formatting | N/A | N/A | 0.00 |
| Mean AST navigation ms | N/A | 0.00 | N/A |
| Mean observed parent-process CPU ms | 463.5 | 387.7 | 340.8 |
| Mean local graph input bytes scanned (including repeat freshness scans) | N/A | N/A | 0 |
| Mean local graph freshness-scan ms | N/A | N/A | 0.00 |

## Every executed attempt

| Task | Arm | Rep | Accepted | Completed | Inference cost | Input incl. cache | Output | Tool calls | Files | Source bytes | Wall s | Index ms | Changed files |
|---|---|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| prerelease-diff | baseline | 1 | true | true | $0.016709 | 15553 | 360 | 10 | 4 | 7175 | 17.42 | 0.00 | src/functions/diff.js |
| prerelease-diff | ast | 1 | true | true | $0.020240 | 16164 | 372 | 11 | 4 | 7175 | 15.65 | 0.00 | src/functions/diff.js |
| prerelease-diff | semantic | 1 | true | true | $0.029288 | 17821 | 386 | 10 | 4 | 7175 | 25.18 | 0.00 | src/functions/diff.js |
| dependency-aliases | ast | 1 | true | true | $0.014296 | 11735 | 712 | 13 | 4 | 2213 | 25.64 | 0.00 | src/order.mjs, src/registry.mjs |
| dependency-aliases | semantic | 1 | true | true | $0.018790 | 13041 | 730 | 13 | 4 | 2213 | 24.45 | 0.00 | src/order.mjs, src/registry.mjs |
| dependency-aliases | baseline | 1 | true | true | $0.015837 | 10232 | 729 | 13 | 4 | 2213 | 24.38 | 0.00 | src/order.mjs, src/registry.mjs |
| inventory-reservations | semantic | 1 | true | true | $0.027686 | 14573 | 535 | 28 | 17 | 6110 | 18.82 | 0.00 | src/item-plan.mjs, src/request-key.mjs, src/stock-repository.mjs, src/stock-transaction.mjs |
| inventory-reservations | baseline | 1 | true | true | $0.018452 | 11936 | 601 | 25 | 14 | 5587 | 19.45 | 0.00 | src/item-plan.mjs, src/request-key.mjs, src/stock-repository.mjs, src/stock-transaction.mjs |
| inventory-reservations | ast | 1 | true | true | $0.026722 | 13221 | 636 | 25 | 14 | 5587 | 22.21 | 0.00 | src/item-plan.mjs, src/request-key.mjs, src/stock-repository.mjs, src/stock-transaction.mjs |
| prerelease-diff | baseline | 2 | true | true | $0.021954 | 14962 | 419 | 11 | 4 | 7175 | 18.21 | 0.00 | src/functions/diff.js |
| prerelease-diff | semantic | 2 | true | true | $0.018796 | 17341 | 430 | 12 | 5 | 7256 | 17.92 | 0.00 | src/functions/diff.js |
| prerelease-diff | ast | 2 | true | true | $0.029020 | 16321 | 416 | 12 | 5 | 7256 | 16.87 | 0.00 | src/functions/diff.js |
| dependency-aliases | ast | 2 | true | true | $0.021061 | 12049 | 815 | 16 | 4 | 2213 | 25.16 | 0.00 | src/order.mjs, src/registry.mjs |
| dependency-aliases | baseline | 2 | true | true | $0.016164 | 10312 | 770 | 13 | 4 | 2213 | 29.42 | 0.00 | src/order.mjs, src/registry.mjs |
| dependency-aliases | semantic | 2 | true | true | $0.018052 | 13047 | 728 | 13 | 4 | 2213 | 25.29 | 0.00 | src/order.mjs, src/registry.mjs |
| inventory-reservations | semantic | 2 | true | true | $0.021276 | 19401 | 874 | 26 | 14 | 5587 | 30.21 | 0.00 | src/item-plan.mjs, src/request-key.mjs, src/stock-repository.mjs, src/stock-transaction.mjs |
| inventory-reservations | ast | 2 | true | true | $0.017434 | 13573 | 561 | 28 | 17 | 6110 | 20.16 | 0.00 | src/item-plan.mjs, src/request-key.mjs, src/stock-repository.mjs, src/stock-transaction.mjs |
| inventory-reservations | baseline | 2 | true | true | $0.018626 | 12328 | 540 | 28 | 17 | 6110 | 18.81 | 0.00 | src/item-plan.mjs, src/request-key.mjs, src/stock-repository.mjs, src/stock-transaction.mjs |

## Per-task means

| Task | Arm | Accepted | Mean cost | Mean tool calls | Mean files | Mean wall s |
|---|---|---:|---:|---:|---:|---:|
| prerelease-diff | baseline | 2/2 | $0.019332 | 10.5 | 4.0 | 17.81 |
| prerelease-diff | ast | 2/2 | $0.024630 | 11.5 | 4.5 | 16.26 |
| prerelease-diff | semantic | 2/2 | $0.024042 | 11.0 | 4.5 | 21.55 |
| dependency-aliases | baseline | 2/2 | $0.016001 | 13.0 | 4.0 | 26.90 |
| dependency-aliases | ast | 2/2 | $0.017678 | 14.5 | 4.0 | 25.40 |
| dependency-aliases | semantic | 2/2 | $0.018421 | 13.0 | 4.0 | 24.87 |
| inventory-reservations | baseline | 2/2 | $0.018539 | 26.5 | 15.5 | 19.13 |
| inventory-reservations | ast | 2/2 | $0.022078 | 26.5 | 15.5 | 21.19 |
| inventory-reservations | semantic | 2/2 | $0.024481 | 27.0 | 15.5 | 24.51 |

## Accounting and limitations

Budget consumed/reserved: $0.370403 against $7.950000. Unknown usage: false. Subscription billing is not measured.

Unrun attempts: 0. 

Input is the sum of uncached input, cache reads and cache writes from the frozen Pi usage schema. Source retrieval counts delivered UTF-8 snippets, line numbers and import headers, including repeat reads; unique files count paths represented in reads or search snippets. Graph metadata is separate from source bytes. Calls count codemode parents and child tools. Indexing time is a subset of graph tool time, which also includes lazy compiler loading, content-hash scans, relationship expansion and formatting.

Observed parent-process CPU excludes test subprocess CPU; heap/RSS samples include the model runtime and are not isolated peak memory. Agent wall time includes model/network/tool time; independent checks are separately added. No energy or invoice measurement is claimed.

Two tasks are existing authored synthetic tasks, and the real historical issue is reused. The cohort is small, repeated on one machine, and has no claim of independent held-out generalization. Source-read and context differences are observations; the data does not isolate a causal mechanism or justify broad savings claims.

All raw manifests, ledger entries, transcripts, tool evidence, patches and independent test outputs are retained alongside this summary.
