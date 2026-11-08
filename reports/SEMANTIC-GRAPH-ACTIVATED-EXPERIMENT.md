# Activated semantic-navigation experiment: four arms

Completed 2026-11-07 (America/Chicago).

All 24 attempts completed and passed independent acceptance and visible regression checks. All 12 required-navigation attempts passed an independent transcript audit confirming that required evidence was returned before the model response that issued the edits. Semantic-assisted used 45 compiler-graph tools, including 13 impact analyses. AST-assisted used 31 navigation tools. Semantic-optional used no graph tools.

Semantic-assisted cost 2.59× baseline and took 1.64× the mean agent wall time. No correctness gain was observed at the 100% acceptance ceiling. Keep the feature opt-in on this evidence.

## Frozen design and revisions

- Implementation: `46b6c143e842f4207c657bed0851f84c4467c60d`.
- Manifest/execution commit: `38ee1437d421fff1257350bb0f00c66fae390b0e`.
- Branch: [codex/semantic-graph-impact-v1](https://github.com/sufficelabs/suffice/tree/codex/semantic-graph-impact-v1).
- Three identical v1 snapshots × two independent fresh sessions × four arms = 24 attempts. Same gpt-6.1-sol model, low effort, Pi 1.2.0 runtime, source access, scoped ordinary tools, independent graders and frozen prices in every arm.
- All arms share 300 seconds, 26 model turns, 100 tool calls, 4,096 output tokens/request, a $0.75 conservative per-attempt allowance, no retries/compaction/helper model, and no recipe tools. The turn allowance increased equally from v1 to accommodate required investigation. No arm reached that limit.
- Base prompt and tasks are identical; arm-specific instructions and edit gates define the requested workflows. This is a comparison of assisted workflows, including mandatory-analysis overhead, rather than a pure algorithm-only ablation.
- Tasks remain prerelease-diff (reused real node-semver history), dependency-aliases (two-module synthetic exported function/caller repair), and inventory-reservations (15-module synthetic behavioral contract). This reused, small cohort is not fresh held-out evidence.

| Arm | Required activation |
|---|---|
| Baseline | Ordinary files/read/search/edit/test tools |
| AST-assisted | Successful symbols discovery plus symbol_read in the first edited production file before the first modification |
| Semantic-assisted | Current discovery, dependency/caller inspection, and impact analysis on the same relevant symbol/module before every edit |
| Semantic-optional | Identical semantic tool availability; no navigation requirement |

AST gating is initial investigation only. Semantic evidence is refreshed after every successful edit. Symbol impact must contain the exact replaced source span; whole-file/cross-declaration changes require module inspection/impact. Failed, stale, wrong-file and mismatched-symbol evidence cannot unlock writes. All arms serialize mutations. The models followed the instructions: zero writes were blocked by the activation gates.

Workers never receive hidden graders, reference patches or grading metadata. Ordinary tools are confined to each isolated snapshot, with no shell/network/host API in codemode. Visible tests use credential-free Node permission subprocesses. Hidden acceptance runs after the session with no feedback into it. Source/settings/task/test hashes and schedule were committed before scoring. V1 artifacts and source are unchanged.

## Results

| Metric | Baseline | AST-assisted | Semantic-assisted | Semantic-optional |
|---|---:|---:|---:|---:|
| Accepted / completed / compliant | 6/6 / 6/6 / 6/6 | 6/6 / 6/6 / 6/6 | 6/6 / 6/6 / 6/6 | 6/6 / 6/6 / 6/6 |
| Mean estimated inference cost | $0.017706 | $0.021867 | $0.045852 | $0.019604 |
| Cost per independently accepted patch | $0.017706 | $0.021867 | $0.045852 | $0.019604 |
| Mean agent wall seconds | 21.04 | 27.88 | 34.41 | 20.05 |
| Mean wall seconds incl. independent checks | 21.24 | 28.08 | 34.61 | 20.26 |
| Mean model calls | 4.33 | 5.83 | 7.33 | 4.33 |
| Mean tool calls, parent + child | 16.67 | 21.83 | 26.50 | 16.50 |
| Mean total input incl. cache | 12600 | 18982 | 62616 | 14825 |
| Mean cached input | 6997 | 12096 | 46272 | 8256 |
| Mean output tokens | 580 | 689 | 854 | 564 |
| Mean source files retrieved | 7.83 | 7.17 | 7.67 | 8.00 |
| Mean source bytes delivered | 5079 | 4531 | 4248 | 4684 |
| Mean changed files | 2.50 | 2.33 | 2.00 | 2.33 |
| AST calls | 0 | 31 | 0 | 0 |
| Semantic calls | 0 | 0 | 45 | 0 |
| Impact calls | 0 | 0 | 13 | 0 |
| Mean initial-investigation known cost | $0.014286 | $0.018337 | $0.030539 | $0.015209 |
| Mean graph indexing/update ms | N/A | N/A | 177.07 | 0.00 |
| Mean graph tool ms incl. load/hash/format | N/A | N/A | 673.88 | 0.00 |
| Mean admitted graph bytes scanned, repeat reads included | N/A | N/A | 488610 | 0 |
| Mean parent-process CPU ms | 473.83 | 400.83 | 1453.33 | 351.67 |

The semantic workflow retrieved 16.4% fewer source bytes, but total input including cache was 4.97× baseline and mean model calls rose from 4.33 to 7.33. The observed source-retrieval saving did not translate into lower total inference cost.

This is consistent with extra investigation rounds and retained graph/impact output consuming more context. The experiment does not independently isolate instruction length, round count, graph verbosity, cache effects or the gate policy as causal mediators. Reported cached tokens are included in total input and priced at the frozen catalog rates.

Local graph tools averaged 0.674 seconds per semantic-assisted attempt, including compiler loading, hashing, expansion and formatting; indexing/update time was a subset (0.177 seconds). Mean parent CPU was 1.453 seconds versus baseline 0.474 seconds. Those are execution measurements, separate from inference dollars. Parent CPU excludes test-child CPU. Observed compiler/runtime heap samples are in the raw update records, not isolated peak-memory or incremental-memory guarantees. The process is shared across attempts, compiler module loading can warm, and each graph/session/workspace is fresh.

## Per-task means

| Task | Arm | Accepted | Mean inference cost | Mean wall seconds | Mean source bytes |
|---|---|---:|---:|---:|---:|
| prerelease-diff | baseline | 2/2 | $0.017093 | 18.51 | 7175 |
| prerelease-diff | ast-assisted | 2/2 | $0.019077 | 20.51 | 4982 |
| prerelease-diff | semantic-assisted | 2/2 | $0.032202 | 24.07 | 4684 |
| prerelease-diff | semantic-optional | 2/2 | $0.018823 | 15.68 | 5990 |
| dependency-aliases | baseline | 2/2 | $0.017180 | 24.27 | 2213 |
| dependency-aliases | ast-assisted | 2/2 | $0.022132 | 31.68 | 2199 |
| dependency-aliases | semantic-assisted | 2/2 | $0.048048 | 38.12 | 2213 |
| dependency-aliases | semantic-optional | 2/2 | $0.015693 | 24.57 | 2213 |
| inventory-reservations | baseline | 2/2 | $0.018846 | 20.33 | 5849 |
| inventory-reservations | ast-assisted | 2/2 | $0.024392 | 31.44 | 6411 |
| inventory-reservations | semantic-assisted | 2/2 | $0.057306 | 41.03 | 5849 |
| inventory-reservations | semantic-optional | 2/2 | $0.024296 | 19.90 | 5849 |

Every attempt and additional metrics are in [RESULTS.md](semantic-graph-v2/RESULTS.md), with machine-readable [summary.json](semantic-graph-v2/summary.json). No attempted run or failed tool invocation was dropped.

## Activation verification and patch scope

Enforcement unit tests cover ordinary/optional freedom, successful AST discovery/read, failed lookup rejection, wrong-file rejection, same-symbol/revision/epoch checks, exact-span coverage, whole-module writes, stale analysis after edits and racing evidence. The full repository suite passed 110/110 and CLI suite 6/6 before inference. [Test output](semantic-graph-v2/tests.txt), [CLI output](semantic-graph-v2/cli-tests.txt).

Gate records alone were supplemented by a raw transcript audit. It correlates discovery, dependency/caller, impact and mutation call IDs; checks symbol/module relevance and matching revisions/epochs; and verifies successful codemode output containing graph and impact data precedes the assistant generation issuing each edit. All six AST initial investigations and all 13 semantic-authorized edits across six semantic attempts passed. This is stronger evidence than merely counting calls; it cannot prove that the model reasoned well from the evidence. The [audit](semantic-graph-v2/activation-audit.json) and [auditor](../scripts/audit-semantic-activation.mjs) are retained.

All patches preserved immutable files and passed independent checks. Semantic-assisted changed 2.0 files on average versus 2.5 for baseline. Reference-file comparison is retained in [patch-audit.json](semantic-graph-v2/patch-audit.json); extras in other arms include stock-repository guards and one request-normalizer change. The supplied reference repair is not an oracle proving those changes unnecessary, and acceptance does not prove absence of all regressions. No quality superiority is inferred from changed-file counts.

## Budget and reproducibility

V2 used **$0.630179 API-equivalent**, with zero unknown-usage attempts, no cap stop and no unrun attempts. Combined v1+v2 expenditure is **$1.000582 / $8**. The v2 allowance was $7.50 plus the prior $0.3704032; pre-dispatch reservations prevent silent overspend. Subscription invoices are not measured.

The [frozen input archive](semantic-graph-v2/frozen-inputs.tar.gz) contains exact source/prepared-snapshot/grader bytes, including original line endings. SHA-256: `07734c515d2c0f65f2b9924d983eba321fd79796fa2846a6ff6bff31142223f5`; size 181397 bytes. Extraction verified 185 content hashes plus the inventory. One recorded semantic-assisted repair per task was replayed from it: baseline failed, patched acceptance and visible checks passed. [Replay receipt](semantic-graph-v2/archive-verification.json).

For a new inference replay, use a fresh checkout of `38ee1437d421fff1257350bb0f00c66fae390b0e`, install dependencies, extract the archive at its root, then run `node scripts/semantic-activated-experiment.mjs --run` with the matching subscription model/catalog. Keep the archive outside the checkout while switching commits. The runner refuses changed hashes/settings/prices or an existing v2 campaign directory. This creates a new API-equivalent expenditure.

Full frozen instructions and enforcement policy: [protocol](../docs/SEMANTIC-ACTIVATION-EXPERIMENT.md). Raw transcripts, tool outputs, edit evidence, patches, independent test outputs, budget ledger, task validation, source hashes, activation audit and reproducible archive are committed under reports/semantic-graph-v2. The first experiment remains intact.

## Conclusion

This campaign tested activated assistance successfully. On these reused small tasks, requiring semantic graph/impact analysis preserved acceptance, reduced delivered source bytes and increased cost and latency. Natural semantic-tool adoption remained zero. These results support keeping the feature opt-in for now.

The tasks are small, two are synthetic, one real issue is reused, and correctness is already at a ceiling. CommonJS callable aliases and dynamic behavior remain bounded/uncertain in the graph. Mandatory semantic analysis is per-edit while AST is initial-only, so the cost comparison includes that explicit workflow asymmetry. This does not reject the broader hypothesis for larger, fresh TypeScript changes, nor establish a general improvement. A next independent study would need fresh tasks with meaningful relationship discovery and a preregistered policy for compact, reusable analysis rather than re-tuning against these outcomes.
