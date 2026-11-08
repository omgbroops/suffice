# Activated four-arm navigation experiment: recorded outcomes

Implementation: `46b6c143e842f4207c657bed0851f84c4467c60d`. Frozen execution: `38ee1437d421fff1257350bb0f00c66fae390b0e`. Executed 24/24. Stop reason: none.

| Metric | Baseline | AST-assisted | Semantic-assisted | Semantic-optional |
|---|---:|---:|---:|---:|
| Activation-compliant attempts | 6/6 | 6/6 | 6/6 | 6/6 |
| Accepted + completed + compliant | 6/6 | 6/6 | 6/6 | 6/6 |
| Blocked edit attempts | 0 | 0 | 0 | 0 |
| AST navigation calls | 0 | 31 | 0 | 0 |
| Impact analysis calls | 0 | 0 | 13 | 0 |
| Attempts using semantic tools | 0/6 | 0/6 | 6/6 | 0/6 |
| Mean initial-investigation known cost | $0.014286 | $0.018337 | $0.030539 | $0.015209 |
| Independently accepted patches | 6/6 | 6/6 | 6/6 | 6/6 |
| Completed attempts | 6/6 | 6/6 | 6/6 | 6/6 |
| Visible regressions passed | 6/6 | 6/6 | 6/6 | 6/6 |
| Mean total estimated inference cost | $0.017706 | $0.021867 | $0.045852 | $0.019604 |
| Cost per accepted patch | $0.017706 | $0.021867 | $0.045852 | $0.019604 |
| Mean total input tokens (including cache) | 12600 | 18982 | 62616 | 14825 |
| Mean cached input tokens | 6997 | 12096 | 46272 | 8256 |
| Mean output tokens | 580 | 689 | 854 | 564 |
| Mean model calls | 4.3 | 5.8 | 7.3 | 4.3 |
| Mean tool calls (parent + children) | 16.7 | 21.8 | 26.5 | 16.5 |
| Mean agent wall seconds | 21.04 | 27.88 | 34.41 | 20.05 |
| Mean wall seconds including independent checks | 21.24 | 28.08 | 34.61 | 20.26 |
| Mean unique files retrieved | 7.8 | 7.2 | 7.7 | 8.0 |
| Mean retrieved source bytes | 5079 | 4531 | 4248 | 4684 |
| Mean retrieved source lines | 110 | 102 | 98 | 104 |
| Mean changed files | 2.5 | 2.3 | 2.0 | 2.3 |
| Graph lookup calls (total) | 0 | 0 | 45 | 0 |
| Mean graph indexing/update ms | N/A | N/A | 177.07 | 0.00 |
| Mean graph tool ms including import/hashing/formatting | N/A | N/A | 673.88 | 0.00 |
| Mean AST navigation ms | N/A | 10.93 | N/A | N/A |
| Mean observed parent-process CPU ms | 473.8 | 400.8 | 1453.3 | 351.7 |
| Mean local graph input bytes scanned (including repeat freshness scans) | N/A | N/A | 488610 | 0 |
| Mean local graph freshness-scan ms | N/A | N/A | 264.34 | 0.00 |

## Every executed attempt

| Task | Arm | Rep | Accepted | Completed | Compliant | Graph calls | Impacts | Blocks | Inference cost | Input incl. cache | Output | Tool calls | Files | Source bytes | Wall s | Index ms | Changed files |
|---|---|---:|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| prerelease-diff | baseline | 1 | true | true | true | 0 | 0 | 0 | $0.017226 | 15663 | 414 | 10 | 4 | 7175 | 19.33 | 0.00 | src/functions/diff.js |
| prerelease-diff | ast-assisted | 1 | true | true | true | 0 | 0 | 0 | $0.018043 | 19686 | 445 | 14 | 4 | 5365 | 20.22 | 0.00 | src/functions/diff.js |
| prerelease-diff | semantic-assisted | 1 | true | true | true | 3 | 1 | 0 | $0.032098 | 44577 | 496 | 15 | 3 | 4643 | 24.23 | 468.50 | src/functions/diff.js |
| prerelease-diff | semantic-optional | 1 | true | true | true | 0 | 0 | 0 | $0.019128 | 15513 | 318 | 10 | 4 | 4724 | 15.49 | 0.00 | src/functions/diff.js |
| dependency-aliases | ast-assisted | 1 | true | true | true | 0 | 0 | 0 | $0.022685 | 15010 | 823 | 17 | 4 | 2199 | 29.94 | 0.00 | src/order.mjs, src/registry.mjs |
| dependency-aliases | semantic-assisted | 1 | true | true | true | 7 | 2 | 0 | $0.041742 | 51668 | 1088 | 22 | 4 | 2213 | 40.33 | 15.55 | src/order.mjs, src/registry.mjs |
| dependency-aliases | semantic-optional | 1 | true | true | true | 0 | 0 | 0 | $0.015641 | 13287 | 755 | 13 | 4 | 2213 | 25.07 | 0.00 | src/order.mjs, src/registry.mjs |
| dependency-aliases | baseline | 1 | true | true | true | 0 | 0 | 0 | $0.015655 | 10324 | 741 | 13 | 4 | 2213 | 24.26 | 0.00 | src/order.mjs, src/registry.mjs |
| inventory-reservations | semantic-assisted | 1 | true | true | true | 14 | 4 | 0 | $0.058330 | 97710 | 956 | 46 | 17 | 6110 | 39.90 | 68.91 | src/item-plan.mjs, src/request-key.mjs, src/stock-transaction.mjs |
| inventory-reservations | semantic-optional | 1 | true | true | true | 0 | 0 | 0 | $0.021376 | 14754 | 573 | 28 | 17 | 6110 | 20.01 | 0.00 | src/item-plan.mjs, src/request-key.mjs, src/stock-repository.mjs, src/stock-transaction.mjs |
| inventory-reservations | baseline | 1 | true | true | true | 0 | 0 | 0 | $0.018981 | 11819 | 653 | 25 | 14 | 5587 | 21.90 | 0.00 | src/item-plan.mjs, src/request-key.mjs, src/request-normalizer.mjs, src/stock-repository.mjs, src/stock-transaction.mjs |
| inventory-reservations | ast-assisted | 1 | true | true | true | 0 | 0 | 0 | $0.021999 | 22323 | 751 | 36 | 14 | 6402 | 31.09 | 0.00 | src/item-plan.mjs, src/request-key.mjs, src/stock-repository.mjs, src/stock-transaction.mjs |
| prerelease-diff | baseline | 2 | true | true | true | 0 | 0 | 0 | $0.016959 | 15010 | 372 | 11 | 4 | 7175 | 17.70 | 0.00 | src/functions/diff.js |
| prerelease-diff | semantic-optional | 2 | true | true | true | 0 | 0 | 0 | $0.018519 | 18107 | 395 | 11 | 5 | 7256 | 15.87 | 0.00 | src/functions/diff.js |
| prerelease-diff | semantic-assisted | 2 | true | true | true | 3 | 1 | 0 | $0.032305 | 44549 | 498 | 15 | 4 | 4724 | 23.91 | 442.75 | src/functions/diff.js |
| prerelease-diff | ast-assisted | 2 | true | true | true | 0 | 0 | 0 | $0.020112 | 19706 | 429 | 13 | 3 | 4599 | 20.80 | 0.00 | src/functions/diff.js |
| dependency-aliases | ast-assisted | 2 | true | true | true | 0 | 0 | 0 | $0.021580 | 14850 | 939 | 16 | 4 | 2199 | 33.42 | 0.00 | src/order.mjs, src/registry.mjs |
| dependency-aliases | baseline | 2 | true | true | true | 0 | 0 | 0 | $0.018706 | 10387 | 766 | 13 | 4 | 2213 | 24.28 | 0.00 | src/order.mjs, src/registry.mjs |
| dependency-aliases | semantic-optional | 2 | true | true | true | 0 | 0 | 0 | $0.015746 | 13253 | 748 | 13 | 4 | 2213 | 24.08 | 0.00 | src/order.mjs, src/registry.mjs |
| dependency-aliases | semantic-assisted | 2 | true | true | true | 7 | 2 | 0 | $0.054353 | 48567 | 1048 | 22 | 4 | 2213 | 35.91 | 20.44 | src/order.mjs, src/registry.mjs |
| inventory-reservations | semantic-assisted | 2 | true | true | true | 11 | 3 | 0 | $0.056282 | 88625 | 1036 | 39 | 14 | 5587 | 42.16 | 46.30 | src/item-plan.mjs, src/request-key.mjs, src/stock-transaction.mjs |
| inventory-reservations | ast-assisted | 2 | true | true | true | 0 | 0 | 0 | $0.026785 | 22319 | 744 | 35 | 14 | 6420 | 31.79 | 0.00 | src/item-plan.mjs, src/request-key.mjs, src/stock-repository.mjs, src/stock-transaction.mjs |
| inventory-reservations | baseline | 2 | true | true | true | 0 | 0 | 0 | $0.018712 | 12396 | 535 | 28 | 17 | 6110 | 18.76 | 0.00 | src/item-plan.mjs, src/request-key.mjs, src/stock-repository.mjs, src/stock-transaction.mjs |
| inventory-reservations | semantic-optional | 2 | true | true | true | 0 | 0 | 0 | $0.027216 | 14033 | 596 | 24 | 14 | 5587 | 19.78 | 0.00 | src/item-plan.mjs, src/request-key.mjs, src/stock-repository.mjs, src/stock-transaction.mjs |

## Per-task means

| Task | Arm | Accepted | Mean cost | Mean tool calls | Mean files | Mean wall s |
|---|---|---:|---:|---:|---:|---:|
| prerelease-diff | baseline | 2/2 | $0.017093 | 10.5 | 4.0 | 18.51 |
| prerelease-diff | ast-assisted | 2/2 | $0.019077 | 13.5 | 3.5 | 20.51 |
| prerelease-diff | semantic-assisted | 2/2 | $0.032202 | 15.0 | 3.5 | 24.07 |
| prerelease-diff | semantic-optional | 2/2 | $0.018823 | 10.5 | 4.5 | 15.68 |
| dependency-aliases | baseline | 2/2 | $0.017180 | 13.0 | 4.0 | 24.27 |
| dependency-aliases | ast-assisted | 2/2 | $0.022132 | 16.5 | 4.0 | 31.68 |
| dependency-aliases | semantic-assisted | 2/2 | $0.048048 | 22.0 | 4.0 | 38.12 |
| dependency-aliases | semantic-optional | 2/2 | $0.015693 | 13.0 | 4.0 | 24.57 |
| inventory-reservations | baseline | 2/2 | $0.018846 | 26.5 | 15.5 | 20.33 |
| inventory-reservations | ast-assisted | 2/2 | $0.024392 | 35.5 | 14.0 | 31.44 |
| inventory-reservations | semantic-assisted | 2/2 | $0.057306 | 42.5 | 15.5 | 41.03 |
| inventory-reservations | semantic-optional | 2/2 | $0.024296 | 26.0 | 15.5 | 19.90 |

## Accounting and limitations

Budget consumed/reserved: $0.630179 against $7.500000. Unknown usage: false. Subscription billing is not measured.

Unrun attempts: 0.

Input is the sum of uncached input, cache reads and cache writes from the frozen Pi usage schema. Source retrieval counts delivered UTF-8 snippets, line numbers and import headers, including repeat reads; unique files count paths represented in reads or search snippets. Graph metadata is separate from source bytes. Calls count codemode parents and child tools. Indexing time is a subset of graph tool time, which also includes lazy compiler loading, content-hash scans, relationship expansion and formatting.

Observed parent-process CPU excludes test subprocess CPU; heap/RSS samples include the model runtime and are not isolated peak memory. Agent wall time includes model/network/tool time; independent checks are separately added. No energy or invoice measurement is claimed.

Two tasks are existing authored synthetic tasks, and the real historical issue is reused; these are the identical v1 tasks. Required workflows include additional prompt instructions and edit gating. This estimates workflow effects, not a pure algorithm effect. The cohort is small, repeated on one machine, and has no claim of independent held-out generalization. Source-read and context differences are observations; the data does not isolate a causal mechanism or justify broad savings claims.

Combined v1+v2 budget consumed/reserved: $1.000582 / $8.00.

All raw manifests, ledger entries, transcripts, tool evidence, patches and independent test outputs are retained alongside this summary.
