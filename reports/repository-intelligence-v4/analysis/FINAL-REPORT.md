# Repository intelligence v4 final execution report

The architecture remains optional. This experiment does not demonstrate that repository intelligence substitutes for the stronger model. Both graph conditions gained one strict acceptance over Luna baseline, on different tasks. The always-guided gain is weakened by a solution-specific regex-string oracle. The on-demand gain is a plausible cross-file improvement but its one preserved second run failed, and the trajectory does not establish a graph cause. On-demand remained two accepted tasks behind Sol Medium while taking substantially longer.

## Scope and accounting

All dispatch is finished. The amended plan had 96 first-run cells: 72 executed across 18 validated tasks and 24 never dispatched because six environments failed original/reference gates. Sixteen second runs completed before the user removed repetitions; they remain a separate legacy stratum. Five smoke attempts and two availability probes are not engineering observations. There are no stronger fallback models or LLM judges.

One SDK stream interruption was mislabeled agent_error in a raw worker receipt (Prettier 10187 C). The derived analysis applies the existing provider-failure exclusion, preserves the raw label, and does not rerun it. This leaves 71 valid first-run cells and 17 complete four-arm tasks. The intention-to-attempt sensitivity across all 18 dispatched tasks is A 3/18, B 4/18, C 4/18, D 6/18; that table includes a provider interruption as an unsuccessful attempt, not a coding failure. The primary comparison excludes the entire affected task for balance. The 20-minute B timeout on Prettier 8381 remains a genuine common-budget noncompletion with a separately graded failed patch.

Known estimated v4 spending, including repeats/smokes/probes, is $3.14960236. Two requests lack terminal usage receipts; $4.08519512 is the conservative total accounting reservation, not an invoice or statistical interval. The $25 cap was not reached. No missing usage is converted to zero. The B timeout and C stream interruption account for the unknowns. The primary C cost is measurable after excluding the interrupted task; B cost per accepted task remains unknown.

## Matched primary results

| Configuration | Accepted | Accuracy | Estimated inference cost | Cost per accepted | Agent minutes | Worker minutes | Graph-refresh minutes |
|---|---:|---:|---:|---:|---:|---:|---:|
| Luna baseline | 3/17 | 17.6% | $0.38700 | $0.12900 | 98.33 | 127.14 | 0.00 |
| Luna always-guided | 4/17 | 23.5% | unknown | unknown | 139.80 | 168.40 | 54.39 |
| Luna on-demand | 4/17 | 23.5% | $0.41705 | $0.10426 | 142.84 | 173.11 | 17.21 |
| Sol Medium baseline | 6/17 | 35.3% | $1.18939 | $0.19823 | 26.51 | 55.22 | 0.00 |

Token totals for receipts with missing terminal usage are partial and must not be treated as complete consumption. The primary task families are eight Prettier, seven Serverless and two Three.js cases.

Token breakdown, tool selection, sampled RSS, per-task outcomes and service/resource strata are in aggregate.json, cells.json and per-task-comparison.csv. Latencies are summed across 17 attempts per condition. Worker time includes setup and grading, rather than model time alone. Graph durations are measured serialized refresh activity and may overlap other asynchronous work; they are not an exclusive causal wall-time decomposition. Process RSS is sampled and heap deltas/serialized graph bytes do not measure peak memory.

| Comparison | Absolute accuracy difference | Exploratory task-bootstrap 95% |
|---|---:|---:|
| B minus A | +5.88 pp | [+0.00, +17.65] pp |
| C minus A | +5.88 pp | [+0.00, +17.65] pp |
| C minus B | +0.00 pp | [-17.65, +17.65] pp |
| C minus D | -11.76 pp | [-29.41, +0.00] pp |

Intervals use 10,000 task-cluster percentile resamples and are conditional on the observed repository families. With one positive discordance per graph-versus-baseline comparison they are sparse and cannot establish superiority. The apparent C/D gap also does not establish equivalence or its absence. Repository-family dependence, incomplete environments, post-observation sample-size changes and model effort differences weaken population inference. Luna is xhigh and Sol is Medium: this is a comparison of configurations, not foundation-model size in isolation.

C's observed cost per accepted task is about 19% below A and 47% below D in this matched subset. C has only four successes, lower verified accuracy than D, and the favorable difference over A depends on one unreplicated task. This is a descriptive cost-efficiency signal, not evidence of equal capability or a robust architecture advantage. Sol used less agent time and far fewer tokens; model pricing alone does not determine task cost.

## Mechanism audit in both directions

Serverless 5640 is B's only strict improvement over A. All arms changed the same six files and passed 205 required regressions. Only B matched the literal default-regex string expected by the constructor assertion. The star appears at different positions inside equivalent-looking character classes in other patches. A post-hoc check found matching ASCII character sets and identical results on 132 regex fixtures for all four patterns. This does not prove complete software correctness, and no primary grade is changed. It does prevent treating literal-oracle agreement as strong evidence of better repository understanding. Initial graph suggestions pointed to CloudWatch/API Gateway files; later suggestions repeated already edited files. No unique useful graph fact or causal use was established.

Prettier 8381 is C's only strict improvement over A and its improvement over B. C implemented preservation of custom-engine front matter through CSS, HTML and Markdown; Sol also passed. C's trace contains ordinary rg searches for front-matter consumers after its initial edit. Graph candidates often reflect existing edited paths. The record supports a successful cross-file patch but cannot attribute consumer discovery to graph evidence. The one pre-amendment C repeat failed. B timed out after 1,200 seconds and failed all three targets; its initial guidance included Markdown files that it explored extensively, but the trajectory does not prove guidance caused the timeout. Plain text search could expose the same consumers more cheaply.

The counterexample Serverless 5640 shows on-demand losing to always-guided without a demonstrated semantic graph mechanism. The counterexample Prettier 8381 shows always-guided losing to on-demand, with substantial overhead and a timeout. These are as important as favorable cases.

Three.js 23796 and Prettier 12584 explain C's two-task deficit to Sol. Luna found the relevant classes in Three.js but omitted Euler's order element; both Sol repetitions passed. In Prettier 12584, B passed the new targets but violated the required non-TypeScript regression, while Sol passed both repetitions. Static path discovery did not supply the missing implementation semantics. These are not proofs of missing dependency edges. Full descriptive cases are in mechanism-analysis.json.

## Information accuracy versus engineering success

This campaign measured engineering acceptance. It did not collect an independent real-repository ground-truth graph-versus-AST/search accuracy benchmark, so the first research question remains unmeasured at that scale. Existing cross-file, invalidation, provenance and dynamic-reference tests establish fixture behavior, not comparative repository-information precision. The evidence audit found noisy initial ranking and edit-derived context, and cannot quantify retrieval recall or justify causal attribution from final-path overlap. No behavioral correctness is inferred from static dependencies.

The graph/parser/controller are unchanged from v3. Existing AST and search remain available. Stable symbol identities, module facts, provenance, content/revision versions and incremental parsing are documented in the architecture/schema audit; they were not redesigned during final evaluation. Full-source freshness scans remain costly. The matched guided condition accumulated about 54 minutes of refresh activity, on-demand about 17 minutes. Three.js cold graphs reached about 266 MiB serialized and about 620 MiB heap delta in one run; these are not process-peak bounds. The 128 KiB JS/TS selection, JSX/parser gaps, unresolved dynamic calls and incomplete CommonJS binding resolution limit coverage.

## Infrastructure audit and remaining limits

The historical 126 unrun cells belonged to an earlier checkpoint, not 126 coding failures. V3 ultimately executed 36 attempts; 108 remained after the next environment failed. V4 keeps those results separate. It added exact catalog/credential/effort receipts, independently reconstructed grading, held-out access denial, native Windows sandbox/child/network probes, graph freshness/cache checks, full usage auditing and a total cap.

Six v4 task environments failed: Three.js 14836/18648 expected absent nested test/package.json; Three.js 22566 failed public framework execution; Serverless 4892 failed reference framework execution; Serverless 5728/5299 failed the original/reference acceptance gate. Their diagnostics are retained and their tasks were not replaced based on outcomes. This is substantial environment-driven selection bias, especially for Three.js; native adaptation is not an official SWE-PolyBench score.

RAM/disk admission stopped four zero-request launches; all originals remain and no coding outcome was retried. Recovery storage suffixes identify first actual model starts after those stops. Reproducible scratch was reclaimed only after archive/baseline/receipt checks. Concurrency stayed one because no unattended temperature feed was available. CPU below 85 degrees was never guaranteed. User-authorized RAM floors changed after restart; host conditions varied. Priority was requested prospectively, but receipts reported default, so no Fast speedup is claimed. The actual regular Responses provider controls price interpretation; an earlier Codex-specific assumption was corrected without editing raw receipts.

The user removed repetitions after 16 repeats had completed. Repetition zero is the primary set regardless of outcome, with old repeats separate and a pre-amendment report snapshot preserved. Removing second runs also removes two rows of the original Williams ordering, weakening carryover balance and repeatability assessment. Public historical issues may be training-contaminated. Some task contracts are solution-specific; Serverless 5926 concerns were flagged before graph-arm outcomes, while the 5640 string-equality concern is post-hoc. No exploratory exclusion is substituted for the frozen strict scores.

## Recommendation and smallest useful follow-up

Keep the engine optional and do not expand graph features on the strength of these results. There is no demonstrated stronger-model substitution and little credible causal evidence for an accuracy gain. Preserve the cost-per-accepted signal as a hypothesis, with its small denominator and missing-cost limits explicit.

First validate behavioral oracles and framework adapters on separate development cases, and reduce full-scan freshness overhead without using this final cohort for trigger/prompt tuning. A targeted follow-up could use four fresh, well-specified cross-file issues and three Luna conditions: existing search, on-demand graph, and a cheap text-retrieval evidence control (12 attempts). Freeze the tasks, behavior-based oracles and budgets before dispatch. Record whether each relevant fact precedes and changes a decision; separately audit relationship precision/coverage. Compare against Sol only after retrieval shows a credible benefit. No follow-up runs have been launched.

## Reproduction and artifacts

- Architecture starting-point/component/schema audits: docs/REPOSITORY-INTELLIGENCE-AUDIT.md, docs/REPOSITORY-INTELLIGENCE.md and docs/REPOSITORY-INTELLIGENCE-V4.md.
- Original frozen source/protocol: protocol.json, frozen-source.tar.gz. Actual amendments: effective-protocol.json and infrastructure/*.json. Dataset/commits/provenance and selection exclusions: benchmarks/intelligence-v4/cohort.json.
- Raw receipts, trajectories, production-only independent reports and exact patches: attempts/. Unknown usage remains in spending.json. Models use the provisioned host auth profile; credentials are not in Git or logs.
- Rebuild numerical analysis without inference: node scripts/report-intelligence-v4.mjs. Validate analysis behavior: node --test tests/intelligence-v4-analysis.test.mjs (4/4 passed). The earlier frozen full suite passed 145/145; it was not rerun after analysis-only edits.
- failure-analysis.json separates missing environments, provider interruption and budget noncompletion. mechanism-analysis.json and regex-oracle-audit.json retain the descriptive post-hoc audit. cells.csv includes legacy/removed repetition flags, and per-task-comparison.csv maps all 24 tasks.
- A fresh full rerun requires the pinned dataset bytes/sealed records, dependency locks/content hashes, preserved source tar/baselines and the documented native Windows MXC runtime. Use a fresh output namespace; continuation intentionally skips existing outcomes and is not an outcome-based retry command. No claims of portability or identical host conditions are made.
