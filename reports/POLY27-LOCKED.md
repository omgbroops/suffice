# V10 versus native Codex on 27 Polyglot exercises

**V10 passed 17/27; native Codex passed 24/27.** V10 cost about 86% less and took about 35% longer per attempt. These are strict canonical-suite conformance scores on a known development cohort. Missing public API requirements, described below, limit what they establish about general engineering quality.

| Metric | Suffice v10 | Native Codex |
| --- | ---: | ---: |
| Canonical source acceptance | 17/27 (63.0%) | 24/27 (88.9%) |
| Accepted under frozen wrapper/completion metric | 13/27 | 24/27 |
| Agent reported completion | 20/27 | 27/27 |
| Agent returned unverified | 7/27 | 0/27 |
| Total estimated model cost | $0.22647746 | $1.62479240 |
| Estimated cost per accepted source | $0.01332 | $0.06770 |
| Mean actor time | 87.6 s | 63.6 s |
| Mean time including setup/sealing | 92.3 s | 68.6 s |
| Repairs / expert takeovers | 1 / 0 | — |
| Deadline timeouts / unknown costs / ungraded sources | 0 / 0 / 0 | 0 / 0 / 0 |

All **54 scheduled attempts** closed before candidate grading. Paired results: 16 both pass, eight native-only passes, one v10-only pass and two both fail. Total benchmark model-usage estimate: **$1.85126986**. Execution ran on October 23, 2026, from 22:22:14 to 23:03:51 UTC; grading began afterward. No private outcome triggered an agent rerun, checkpoint selection, repair or escalation.

## Interpretation and contract limits

This run supports a narrow cost/conformance tradeoff, with no demonstrated accuracy advantage for v10. These small standalone exercises give limited evidence about larger repository work. It also exposed a problem with hiding all original Exercism tests: those tests sometimes define API requirements absent from the prose and starter files. Existing repository tests would normally remain available in a repository-repair benchmark.

For example, both go-counting implementations failed collection because canonical tests import `WHITE`, `BLACK` and `NONE`, names absent from the supplied public starter and instructions. V10's Java affine-cipher and satellite failures include exact exception messages that were not supplied publicly. Alphametics prose illustrates single-equals puzzles while the JavaScript canonical suite supplies double-equals strings; V10 implemented only the former. These failures are retained in the frozen scores. No actor was rerun, no test assertion changed, and no task was removed. The [post-run contract review](poly27-protocol-20261023-r2/contract-caveats.json) records further convention issues. A future version should publish the complete API contract before withholding new acceptance cases.

The seven unverified v10 attempts split into four rejected generated tests and three ambiguous arbitrations. Rejected tests failed the controller's exact, bounded requirement-quote check; they did not run. The ambiguous cases involved a Tree accessor assumed by the test writer, coordinate origin and book numbering. Four unverified sources nevertheless passed canonical grading: JavaScript house, Go two-bucket, Rust decimal and Go wordy. The other three failed. V10's one repair, on Python connect, used its own public-spec check; the final source passed canonical grading. There were no Sol takeovers.

Seven of v10's 20 reported completions failed the canonical suite despite satisfying its own check gate. Beyond the contract-convention failures, the results include missed Unicode letter counts and base-conversion edge cases. Its generated checks were insufficient to establish canonical conformance on those tasks.

The frozen completion metric uses the recorded `policyValid` flag: completed status, deadline compliance and no outer-wrapper restoration. V10's controller separately recorded earlier `Cargo.lock` restorations for Rust pig-latin and decimal. Those internal events do not appear in the outer flag; requiring no restoration at either layer would reduce v10's accepted/completed count from 13 to 12. That additional count is a post-run interpretation, not a replacement score. Both canonical source scores remain unchanged.

Recorded Cargo test commands and a separate metadata-only public-baseline probe are strongly consistent with automatic lockfile comment/version normalization, with unchanged package sections. No explicit dependency-file edit was observed. The transient pre-restoration bytes were not sealed, so that historical delta cannot be proved exactly; the [independent review](poly27-protocol-20261023-r2/audit-review.json) retains this distinction.

## Protocol and models

This uses the exact historical 27-task Exercism/Aider cohort under an adapted [SWE-bench Pro V2 isolation and replay protocol](https://github.com/scaleapi/SWE-bench_Pro-os/blob/main/v2/README.md). It measures a Polyglot development cohort, not a SWE-bench Pro score. All exercises were used in earlier development, with possible model familiarity and one attempt per task and arm. The original Exercism tests are publicly available upstream; they are withheld from the agents during this run. Isolation cannot rule out prior model familiarity with them.

The [frozen protocol](../docs/POLY27-LOCKED-PROTOCOL.md) is committed as `5dcf493`. Its plan fingerprint is `56c20e261444daf18367790c37a2814a28425d69f19a05bbc800277f7c6eb8dd`. The controller and native adapter are unchanged from the earlier [15-task comparison](V10-NATIVE15.md).

V10 uses Pi 1.2.0 with GPT-6 Luna high for implementation, GPT-6.1 Sol low for independent public-spec checks/arbitration, and optional Sol high takeover. Native uses Codex CLI 0.164.0 with GPT-6.1 Sol high and its controlled single-agent tool profile. Both receive identical public task inputs and a 50-minute agent deadline, with two CPU cores and 3 GB memory per attempt. There is no practical dollar cutoff. V10 retains its existing per-stage turn and tool limits.

V10's parser-backed symbol navigation supports JavaScript/TypeScript. Its file, search and development-command tools handle the other languages; this run does not add language parsers or tune the controller using these outcomes.

Each attempt runs in a fresh nonroot container with only its own public exercise and model-service access. Dependencies are installed in advance. Neither the canonical tests nor reference implementations are mounted into actors. All 27 original stubs failed and all 27 authentic references passed before freezing, covering 460 canonical test cases per arm. Private acceptance outcomes are unavailable during coding and cannot select checkpoints, trigger escalation or fund retries.

The public inputs include frozen C++/JavaScript interface supplements and pinned Rust dependency manifests for decimal and pig-latin, supplied identically to both arms. Rust 1.85.1 supports the upstream references. Assertions are unchanged; language-specific disabled/ignored tests are activated. Rust acceptance counts include only the restored integration targets, excluding unit tests embedded in a reference implementation. These input/environment differences prevent direct comparison with the friend's historical Opus/rescue totals.

After closure, each sealed binary Git patch is replayed onto a pristine public baseline in a fresh offline grader. Immutable build/control files and all canonical tests are restored; actor-generated tests and Python bytecode are removed. A passing result requires every expected test and no skips. Source acceptance and operational/protection compliance are reported separately, including failed/unverified agents and unknown costs.

Cost estimates use frozen catalog rates rather than subscription charges: Luna input/output/cache-read/cache-write $0.10/$0.50/$0.01/$0.125 per million tokens; Sol $2/$10/$0.10/$2.50. Native aggregate token receipts do not establish per-request long-context pricing. Setup canaries are separate: their known estimate floor is $0.05285470, with one additional failed setup attempt conservatively retaining unknown cost. Requested model/effort and raw receipts are recorded; provider-side execution effort and native per-response backend identity are not independently attested.

## Per-task results

| Task | V10 | Native | V10 status | Cases |
| --- | --- | --- | --- | ---: |
| cpp_all-your-base | Fail | Pass | completed | 17 |
| cpp_complex-numbers | Pass | Pass | completed | 40 |
| cpp_phone-number | Pass | Fail | completed | 18 |
| cpp_sublist | Pass | Pass | completed | 18 |
| go_alphametics | Pass | Pass | completed | 11 |
| go_say | Pass | Pass | completed | 20 |
| go_two-bucket | Pass | Pass | unverified | 14 |
| go_word-search | Fail | Pass | unverified | 25 |
| go_wordy | Pass | Pass | unverified | 24 |
| java_affine-cipher | Fail | Pass | completed | 16 |
| java_all-your-base | Fail | Pass | completed | 20 |
| java_pig-latin | Pass | Pass | completed | 22 |
| java_satellite | Fail | Pass | unverified | 9 |
| javascript_alphametics | Fail | Pass | completed | 9 |
| javascript_grade-school | Pass | Pass | completed | 10 |
| javascript_house | Pass | Pass | unverified | 14 |
| javascript_two-bucket | Fail | Fail | completed | 10 |
| python_affine-cipher | Pass | Pass | completed | 16 |
| python_connect | Pass | Pass | completed | 10 |
| python_go-counting | Fail | Fail | completed | 11 |
| python_proverb | Pass | Pass | completed | 8 |
| python_transpose | Pass | Pass | completed | 12 |
| rust_accumulate | Pass | Pass | completed | 12 |
| rust_book-store | Fail | Pass | unverified | 18 |
| rust_decimal | Pass | Pass | unverified | 44 |
| rust_parallel-letter-frequency | Fail | Pass | completed | 10 |
| rust_pig-latin | Pass | Pass | completed | 22 |

## Verification and evidence

The targeted suite passed 91 tests; the final orchestration suite passed nine (overlapping eight earlier tests), and the archive suite passed six. Live model/tool canaries passed in both arms. Every original stub was rejected and every reference passed before the plan was frozen. Setup corrections and failed probes remain in the evidence.

The final audit verified all 54 exact source inventories and patch hashes, reparsed all 27 native receipts, reconciled 59 Pi stages containing 302 messages with complete usage, and authenticated all 54 candidate-grade receipts without discrepancies. No AST navigation events were recorded in this exercise cohort; availability of those tools does not establish their benefit here. Provider-executed reasoning effort and native per-response backend identity remain unproven.

Machine-readable [summary](poly27-protocol-20261023-r2/summary.json), [grades](poly27-protocol-20261023-r2/grades.json), [task CSV](poly27-protocol-20261023-r2/task-results.csv), [closure](poly27-protocol-20261023-r2/execution-complete.json), [plan](poly27-protocol-20261023-r2/plan.json), [reference validation](poly27-protocol-20261023-r2/reference-validation.json), [audit](poly27-protocol-20261023-r2/audit.json), and [independent review](poly27-protocol-20261023-r2/audit-review.json) accompany this report.

The [results archive](poly27-protocol-20261023-r2/results-evidence.zip) preserves public/grader inputs, raw model receipts and logs, sealed patches/source, all grader logs and setup failures. The [runtime archive](poly27-protocol-20261023-r2/runtime.zip) contains the frozen source and protocol. The [file inventory](poly27-protocol-20261023-r2/evidence-files.json) and [archive receipt](poly27-protocol-20261023-r2/archive.json) record verified bytes and explicit exclusions. Credentials, host homes, dependency/build caches and generated binaries are excluded; canonical binary support files already bound into the frozen inputs are retained where applicable. Container images and the native CLI package are not embedded; image IDs, package digest and build recipes are retained.

An [independent ZIP audit](poly27-protocol-20261023-r2/independent-zip-audit.json) using Python's standard library verified all 6,053 archive entries against the original SHA256 inventory. The results archive is about 6.7 MB. The [verification script](poly27-protocol-20261023-r2/verify-archives.py) can repeat that check locally.
