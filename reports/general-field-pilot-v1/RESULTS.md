# General-purpose Suffice: compatibility and real-issue pilot

The separately versioned **suffice-general-v1** configuration passed compatibility checks and completed its three scheduled coding attempts. On historical node-fetch #1446, Suffice and native stock Pi both met independent acceptance; Suffice cost **$0.0784368 versus $0.0863372**, a **9.15% observed reduction**. Suffice also met independent acceptance on the unpaired live async-mutex #90 attempt for **$0.0732444**. This is a small descriptive pilot, not evidence of general superiority or improved capability over Pi.

The old frozen configuration, its 391 inputs and its review ZIP remain unchanged. Its earlier 28.9% result applies to that older configuration and three-task cohort. These new results are separate.

## What changed, and what did not

Inspection found restrictions in both the benchmark adapter and shared prototype workspace tools. The adapter restricted exact production files; shared tools restricted writes to `src/`, hid dot paths, capped files, and hardcoded a visible-test runner. Pi's underlying tools already supported general software engineering.

General v1 therefore binds existing Pi 1.2.0 native `read`, `bash`, `edit`, and `write` tools to the same codemode architecture, alongside the existing AST navigator with its existing TypeScript option. It permits authorized repository files, packages, tests, root/build/CI configuration, and project commands. The minimal prompt, deterministic tool execution and append-only history remain. No model delegation, router, compression policy, memory controller or extra reasoning stage was added. The subagents reviewing this pilot are evaluators, not part of the tested harness or benchmark inference costs.

The configuration was frozen before inference. Its manifest hashes 14 source/configuration inputs and pins runtime files; campaign inputs, public prompts, private checks and source snapshots have a separate freeze manifest. See [configuration](../../docs/general-v1/CONFIGURATION.md), [compatibility](../../docs/general-v1/COMPATIBILITY.md), [frozen configuration](../general-v1/frozen-configuration.json) and [pilot protocol](../../docs/general-v1/PILOT-PROTOCOL.md).

## Compatibility result

Nine deterministic groups passed with **zero model calls**: multi-package JS/TS edits; root, hidden CI and new-test files; npm tests/build/lint; JS/strippable TS navigation; explicit unsupported-TS fallback; traversal/symlink denial; private reads from commands and descendants denied; read-only runtime writes denied; command timeout with child cleanup. Separate outer timeout and output-ceiling probes also stopped their processes. Both actual agent entry points passed a zero-inference model/tool startup preflight.

AST navigation remains syntactic, not a resolved TypeScript graph. TSX/JSX, non-strippable TS constructs, hidden directories and oversized files can require native read/search/compiler commands. Neither scored Suffice attempt called AST tools, so this result cannot be attributed to AST navigation.

The native Windows isolation executor failed before inference. Both scored agents instead used the same already installed WSL Ubuntu/Bubblewrap boundary and separately pinned Node 24.15.0 runtime. There was no unrestricted fallback. Public workspace, own receipts, required runtime and inference authentication were mounted; private graders/reference solutions/research/other actors were not. Host environment credentials were cleared. Actor dependencies were independently copied. Process limits and credential-boundary caveats are documented in the configuration; per-process limits are not an aggregate memory quota.

## Tasks and independent controls

| Task | Source and scope | Control validation |
| --- | --- | --- |
| Historical h02 | [node-fetch #1446](https://github.com/node-fetch/node-fetch/issues/1446), keep-alive socket listener retention; upstream pre-fix `004b3ac8324e6cdbfb5d04b8bbdc6664ea48fbcf` | Original code fails listener-retention acceptance; exact upstream repair passes. Malformed-stream and abort rejection checks also run. |
| Live l01 | [async-mutex #90](https://github.com/DirtyHairy/async-mutex/issues/90), semaphore work proportional to numeric capacity; current snapshot `b0bb4c5aa0e42eb5ffc8d9342e56bb6de1b95554` | Original code exceeds the 10-second deadline at the reported capacity 2,147,483,628. The same behavioral assertions at capacity 16 pass, along with all 153 original tests and build/lint. |

Agents received the original issue requirements, complete public source and common environment policy. Historical fixing source and independent checks were unavailable during coding. Private tests ran only after attempts stopped, without hidden-test repair feedback. Submitted production changes were graded on clean source with original upstream tests restored; agent-authored tests remain in patches but cannot determine acceptance.

These issues exercise real resource lifecycle and weighted/priority state behavior. They produced localized two-file patches in a few minutes; they did **not** establish long-horizon workload conditions, cross-package integration difficulty, compaction pressure or a need for persistence/delegation. The historical issue is previously resolved public material, so model training contamination cannot be ruled out.

The live issue was open, unassigned and had no observed matching implementation when screened, but its repository's last push was July 2025. It is an explicitly low-activity reserve pilot, not a completed 3–5-task active live cohort. Screening notes preserve exclusions rather than silently replacing unavailable or already-implemented issues. The earlier research worktree contains 16 detailed historical and 14 detailed live candidates; no 6–8-task historical or 3–5-task live scored campaign ran here.

## Scored attempts

All attempts used **GPT-6.1 Sol low**, Pi 1.2.0 and the same subscription provider. Each had the same $0.75 API-equivalent allowance, 60-response/240-observed-call limits and ten-minute outer limit. The historical pair had identical source, dependency versions and task text. Native stock Pi retained its normal CLI, native prompt and tools, retries, compaction and cache policy. It was not the earlier restricted direct-tool SDK baseline.

| Attempt | Agent / task | Independent acceptance | Budget eligible | API-equivalent cost | Model responses | Native primitive calls | Agent wall time |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| 001 | Suffice / historical h02 | Accepted | Yes | $0.0784368 | 8 | 14 | 234.9 s |
| 002 | Stock Pi / historical h02 | Accepted | Yes | $0.0863372 | 19 | 18 | 268.9 s |
| 003 | Suffice / live l01 | Accepted | Yes | $0.0732444 | 7 | 7 | 137.9 s |

Suffice made 7 and 6 provider-visible codemode calls respectively. Counting both wrappers and nested primitives gives the raw observed tool-call counts 21 and 13; stock Pi has 18 native calls and no wrappers. These raw counts are not interchangeable. There were 34 finalized responses and 34 matched provider-usage receipts across the three attempts. No scored attempt had an operational failure, coding failure, missing receipt or unknown full benchmark cost.

For the historical pair, acceptance and budget-eligible success are 1/1 in each arm. Thus cost per accepted task equals the respective total cost above, including every response. The observed difference is $0.0079004. There are no repeated trials or independent task-level sample large enough to establish a reliable population advantage. Fixed order, prompt/cache differences, model sampling and environment effects remain confounded. The unpaired live attempt establishes no relative cost or correctness advantage over Pi.

### Usage and cost attribution

| Attempt | Fresh input tokens / cost | Cached input tokens / cost | Output tokens / cost |
| --- | ---: | ---: | ---: |
| 001 Suffice | 29,794 / $0.0595880 | 41,088 / $0.0041088 | 1,474 / $0.0147400 |
| 002 Pi | 27,625 / $0.0552500 | 127,872 / $0.0127872 | 1,830 / $0.0183000 |
| 003 Suffice | 24,024 / $0.0480480 | 33,664 / $0.0033664 | 2,183 / $0.0218300 |

Rates captured in model startup receipts are $2/million fresh input, $0.10/million cached input and $10/million output. Total known benchmark inference is **$0.2380184**, with zero unknown totals. This is an API-equivalent estimate from usage records, **not actual subscription spending or total project expenditure**. Engineering and independent-review inference is excluded and not fully priced. Tool schemas and outputs are already included in model usage; deterministic command/evaluation time is separate. Event-based accounting retains finalized responses independently of the SDK's final conversation and reconciles raw provider usage, model/effort, tool exposure, prompt hashes and submitted-versus-graded bytes.

## Correctness and environment limits

Historical submissions both stop unbounded listener accumulation under actual socket reuse, while preserving the sampled malformed/aborted-stream behavior. Each passes the three private checks. All 390 original native tests were rerun separately for each patch: **385 passed, three pending, two failed** with the same identities as both pre-fix and exact-reference controls. The two preserved failures concern a split final HTTP chunk/EOM and the agent `family` option (`Invalid IP address: undefined`). They are not newly introduced patch failures, but the suite is not wholly green.

Both agents also encountered the old XO lint dependency crashing on Node 24 with `util.isDate is not a function`. Historical lint was not included in the pre-inference gate, so that compatibility gap was discovered during attempts. It is a tooling/environment limitation, not evidence of model coding inability. These patches are not presented as fully CI-green or merge-ready. Listener/abort checks do not constitute a comprehensive heap, active-handle or all-lifecycle leak proof.

The live patch replaces capacity-indexed sparse storage with a map of active weight buckets, visiting weights in descending order and retaining priority/FIFO behavior. It passes the independent large-capacity scenarios, all **153 original native tests**, TypeScript build and project lint. Verification requires a complete success receipt under a deadline, preventing early process exit from being mistaken for a pass. The repair removes work proportional to numeric capacity; it sorts active buckets on each drain, so many-bucket scaling remains a performance tradeoff rather than a proven universal speedup. Full concurrency/state-space coverage is not claimed.

Independent patch review found no concrete correctness blocker for the narrow contracts. A second evaluator independently reconstructed **all three saved patches using `git apply`**, restored original tests, and reproduced all three acceptance verdicts, historical failure identities and live build/lint success. Dependencies were reused through read-only mounts; source and frozen inputs were verified unchanged. The replay ran private checks in the isolated Linux runtime, whereas initial private scoring used host Node. Replay is validation of these submitted artifacts, not a new coding attempt or a new measured performance sample. See [independent review](independent-review.md) and [independent replay](independent-replay.md).

The independent reviewer also identified two coverage gaps: the live check sorts one event list before comparing, so descending traversal across weight buckets is supported by source review rather than that dynamic assertion; and the native regression gate permits failures by existing title, which can miss worsening behavior under an already failing title. These do not invalidate the observed checks, but limit the acceptance claim. The frozen graders were not changed after seeing results.

## Operational record and preservation

Scored attempts ran serially to avoid local resource contention affecting timing. Independent reviews and patch replay were delegated concurrently after all three attempts had finished. No scored attempts were discarded or rerun to select a favorable result. Pre-inference executor/quoting/virtual-memory and Windows dependency-copy setup failures are retained where raw receipts exist and summarized in [setup incidents](SETUP-INCIDENTS.md); they did not consume benchmark model calls. The dependency copy audit checks file sizes/link targets and package/lock hashes, not hashes of every dependency byte.

The old external-Pi worktree remains untouched. Final preservation checks, audit reports, raw provider/tool events, original issues/source snapshots, generated dependency locks, private evaluator/reference material, all submitted patches and validation logs are included in the evaluator review bundle. Dependencies, authentication, `.git` stores and runtime binaries are excluded. Private evaluation material in that bundle must remain outside future agent workspaces. Live patches are kept for human review; no PR or maintainer message was sent.

## Decision

General v1 is a usable, separately frozen repository-wide configuration, with documented navigation and platform limits. The bounded pilot supports a **promising 9.15% cost difference on one historical issue and one independently accepted live patch**. It does not establish an accuracy improvement, broad efficiency advantage, or an advantage on long engineering tasks.

No additional harness mechanism is justified by these three attempts. The smallest justified next evaluation would add fresh, prespecified matched issues after validating each repository's intended Node/toolchain and grading, with order balanced across tasks. That campaign has **not** been launched automatically. Keep the old result separate, retain this configuration, and review the live patch before any upstream action.
