# Nemotron retrieval results - October 14, 2026

Free Nemotron improved frozen source-region coverage on this small public corpus. The live comparison accepted 8/8 repairs: navigation 4/4, fixed-query semantic retrieval 4/4. Semantic mean known repair-inference cost was 6.3% higher ($0.0265604 versus $0.0249958). This is a small efficiency observation, not established general savings or a capability gain: zero baseline failures and zero rescues. The two scored tasks had already been offline-screened.

## Same-chunk offline comparison

Six fresh upstream tasks/three repositories;60 packets. Every arm ranks identical nonoverlapping60-line production chunks under the same hard context ceiling, including headers. Units are ceil(UTF-8 bytes/3), not actual model tokens. Coverage is held old-side production diff-hunk context coverage, a source-region proxy, not proof of sufficient context. Five queries are researcher problem-only public PR paraphrases; one original issue. Query author saw PR prose, so this is not blind independent-label annotation. No solution/diff text was queried or embedded.

| Estimated ceiling | Ranker | Mean hunk coverage | Mean used units |
|---|---|---|---|
| 2048 | lexical | 43.9% | 1965.8 |
| 2048 | syntax | 10.5% | 1313.2 |
| 2048 | lexical-syntax | 27.2% | 1949.2 |
| 2048 | semantic | 73.8% | 1996.2 |
| 2048 | hybrid | 60.5% | 2013.7 |
| 4096 | lexical | 77.2% | 4034.2 |
| 4096 | syntax | 10.5% | 2729.5 |
| 4096 | lexical-syntax | 60.5% | 4020.5 |
| 4096 | semantic | 100.0% | 4011.0 |
| 4096 | hybrid | 77.2% | 3999.2 |

| Task | Parser failures | Lexical, 2048 | Lexical-syntax, 2048 | Semantic, 2048 |
|---|---|---|---|---|
| [minimatch-272](https://github.com/isaacs/minimatch/pull/272) | all parsed | 63.2% | 63.2% | 100.0% |
| [minimatch-235](https://github.com/isaacs/minimatch/pull/235) | all parsed | 0.0% | 0.0% | 0.0% |
| [path-to-regexp-456](https://github.com/pillarjs/path-to-regexp/pull/456) | src/index.ts | 100.0% | 100.0% | 42.9% |
| [path-to-regexp-448](https://github.com/pillarjs/path-to-regexp/pull/448) | src/index.ts | 0.0% | 0.0% | 100.0% |
| [marked-4101](https://github.com/markedjs/marked/pull/4101) | all parsed | 100.0% | 0.0% | 100.0% |
| [marked-4123](https://github.com/markedjs/marked/pull/4123) | all parsed | 0.0% | 0.0% | 100.0% |

Syntax cannot parse TypeScript parameter properties in both path-to-regexp index files. This weakens syntax/fusion baselines; semantic gains partly compensate for current parser limitations and do not establish superiority over functioning syntax navigation. Pure lexical is 43.9% versus semantic 73.8% at 2048. Semantic loses to lexical on path-to-regexp #456 (42.9% versus 100%) and misses minimatch235 entirely at 2048. Syntax underfills some ceilings. Equal ceilings are not equal actual context consumption. At 4096 semantic covers all labeled hunk-context lines, still not evidence of coding capability. Automated chunk ranking is distinct from interactive agent navigation.

## Live pilot and scored comparison

Separately frozen activation pilot: path-to-regexp #448 / marked #4101, 4/4 accepted, known repair cost $0.0924316. Both semantic attempts used the tool once. Scored: path-to-regexp #456 / marked #4123, two balanced repetitions per arm, 8 attempts. All actors actually GPT-6.1 Sol low, pinned Pi 1.2.0. Both arms share 14 turns / 75 tools / 240 seconds / $0.20 known request-admission ceilings, zero retries, no extra reviewer or hidden feedback. Model maxTokens 2048 was configured but transport sent no max_output_tokens; pilot's output-cap wording was inaccurate, preserved as a limitation, corrected before scored freeze. No transport output-token cap is claimed. Every observed accepted patch stayed within the known model-cost ceiling; overbudget/unknown totals would not count.

Semantic treatment adds one instruction and a tool that retrieves against the frozen public task query, at most two 2048-unit packets, with exact revision/path/line ranges, source-staleness warnings and normal navigation recovery. Every scored semantic attempt invoked it once. No arbitrary actor-generated query, changed source, private harness source or grader was embedded. No live HTTP request, incremental re-embedding, or general dynamic semantic-query policy was tested. This is navigation plus fixed-query initial retrieval, not navigation replacement.

| Arm | Accepted | Mean repair cost | Mean milliseconds | Input tokens | Cache-read tokens | Navigation calls | Semantic calls |
|---|---|---|---|---|---|---|---|
| navigation | 4/4 | $0.0249958 | 25940.8 | 36073 | 51072 | 15 | 0 |
| semantic | 4/4 | $0.0265604 | 24797.5 | 38346 | 64896 | 11 | 4 |

| Task/repetition | Navigation cost | Semantic cost | Semantic relative |
|---|---|---|---|
| path-to-regexp-456/r0 | $0.0332056 | $0.0263360 | -20.7% |
| path-to-regexp-456/r1 | $0.0226936 | $0.0306392 | 35.0% |
| marked-4123/r0 | $0.0193368 | $0.0227648 | 17.7% |
| marked-4123/r1 | $0.0247472 | $0.0265016 | 7.1% |

The observed difference is affected by cache warmth, order, trajectory variability and concurrent PC/provider load. Equal ceilings do not establish an equal-realized-cost frontier; two independent scored tasks/four pairs are a weak sample. Historical public tasks may be in training. No baseline failed. No capability-frontier gain or superiority over stock agents is demonstrated.

## Acceptance and regression scope

Before live freeze, all four original defects failed independent behavioral assertions and all reference fixes passed. Hidden final assertions stayed outside actor workspaces/tools; immutable fixtures/package/files were checked. All attempts, including potential failures/incomplete outcomes, receive external final acceptance and full declared regression. Twelve final repairs passed; no unsupported completions, skipped suites, model-cost unknowns, overruns or failed patches occurred. Independent reconstruction from frozen baselines and saved patches reran all 12 acceptance and full declared regressions, with matching models/low request settings/cost receipts and unchanged frozen bytes.

Path-to-regexp #448 runs all 345 and path-to-regexp #456 all 350 upstream data-driven parser/stringifier/compiler/matcher cases. Native assertions reproduce Vitest undefined/missing-key equality via JSON normalization; only import/type wiring changed. Separate prefreeze adapter failures were preserved (type-only Path import; equality mismatch; erroneous 400-case assumption). Other Vitest error/stack/redos/build/types/lint tests excluded. Marked runs all 652 CommonMark 0.31.2 examples, requiring spec-correct normalized HTML OR identical baseline output. Baselines have 109 and 103 normalized-byte HTML mismatches respectively, not conformance passes. This is complete execution of the declared preservation-or-improvement regression, not full upstream npm/Jest/build/type/lint acceptance or 652 conformance passes. The grading boundary is explicit in frozen source and receipts.

## Cold, warm, amortized and failed setup costs

Scored offline indexing:10 HTTP requests,93238 provider tokens,9915.7172 ms summed HTTP latency, returned cost $0. Querying:6 requests,620 tokens,1325.7434 ms, returned cost $0. Cold six-task index+query workload:16 requests / 93858 tokens / 11241.4606 ms / $0 known. For N repeated uses of this exact cached corpus, index HTTP overhead amortizes as93238/N tokens and9915.7172/N ms; cached identical query reuse costs zero additional embedding HTTP. These are observed token/HTTP overhead allocations, not wall-clock predictions or model-repair savings. Cache-only live retrieval adds no embedding requests, but does not make the original cold work disappear. The full cold corpus includes offline-only tasks; no counterfactual minimal per-live-task index cost is asserted.

Including abandoned setup/probes: 33 embedding HTTP requests,32 completed sanitized receipts,$0.0000000 known returned charges, request15 in-flight at termination has unknown usage/cost. Overall embedding total therefore remains unknown (known zero lower bound), despite confirmed zero route prices and all completed responses reporting cost 0. V1 was stopped before any scoring because input_type was omitted; V1 vectors never enter V2. V2's separately frozen probe supplies passage/query modes and observed nonidentical vectors (cosine 0.868726); dimensions 2048 are fixed in cache keys. The endpoint accepts modes but does not echo upstream mode. NVIDIA docs 4096 input tokens differ from catalog 32768; hard 4000 UTF-8 byte inputs are conservative, not actual tokenization.

First exact returned-ID probe rejected the serving alias; it was an infrastructure identity-validation rejection, not model failure. Requests always used only nvidia/nemotron-3-embed-1b:free; actual returned model private/openrouter/nvidia/nemotron-3-embed-1b and provider Nvidia are retained. The alias was explicitly allowed before the separate V2 freeze. No paid/model/provider fallback or retry. Only public pinned source/query prose was sent to the logging free provider; credentials loaded privately, never exported.

Total investigation:12 live attempts, known repair inference $0.2986564,0 unknown repair totals; embedding known $0 plus one unknown interrupted request. Limits22 attempts / $3 known / 120 embedding requests / 100 MiB artifacts / 1 GiB free respected. These are API-equivalent subscription-backed benchmark estimates, not actual subscription billing or total project spending. Engineering-agent inference and source acquisition are excluded.

## Evidence and limitations

All 60 cached offline packets/coverage were replayed without requests; canonical scored receipt IDs 18-33 pinned in audit. Parent independently replayed the same packets. Source/labels/query/policy/runner freeze hashes: offline 1cab4d148f7ceaf35725a0fd47596168d47f198079e92589e18003ef14d92976; pilot 3894a1ed12ab536e52262c39b7cb163001a7ad89045ba237358f80f93a5456a3; scored 62d3246b2436d87cf61191d345076b49f848e1b808f17fb92229207a65b6f399. Original offline freeze omitted imported workspace/package identity; supplemental unchanged base/dependency/Node identities are separately recorded, not retroactively frozen. Live freezes include these dependencies.

Frozen V2 validated vector count/dimensions/finite values and sorted indices, but did not retain raw response indices or validate unique bounds. Cached vector/hash/ranking replay passes; raw-index uniqueness cannot be retrospectively proven. A strict validator's boundary test was added after scoring; it did not alter V2. Original frozen bytes, abandoned receipts, prefreeze fixture errors, exact patches, final tests and process/PID logs remain preserved. No further campaign extension was launched.

[Aggregate JSON](NEMOTRON-RESULTS.json), [offline JSON](NEMOTRON-OFFLINE-V2.json), [offline audit](NEMOTRON-OFFLINE-AUDIT.json), [pilot](NEMOTRON-LIVE-PILOT-V1.json), [scored](NEMOTRON-LIVE-SCORED-V1.json), [independent saved-patch audit](NEMOTRON-LIVE-AUDIT.json), and [sanitized export inventory](evidence-export.json) are self-contained review entrypoints. Run cached commands from experiments/nemotron/README.md; historical drivers are single-campaign entrypoints and must not overwrite existing evidence. Public endpoint documentation: https://openrouter.ai/docs/api/api-reference/embeddings/submit-an-embedding-request and https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-embed-1b-infer .
