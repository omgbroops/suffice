# V11 versus native Codex: the same 27 exercises

**V11 passed 17/27, unchanged from V10; fresh native Codex passed 24/27.** V11 reduced unverified outcomes from seven to two, but cost 92% more than V10 without increasing canonical acceptance. Against fresh native, it cost 75.7% less and took 75.8% longer per actor. This is a replay of a known development cohort, not held-out evidence or a SWE-bench Pro score.

| Metric | Earlier V10 | V11 replay | Earlier native | Fresh native |
| --- | ---: | ---: | ---: | ---: |
| Canonical source acceptance | 17/27 | 17/27 | 24/27 | 24/27 |
| Actor reported completion | 20/27 | 25/27 | 27/27 | 27/27 |
| Unverified | 7/27 | 2/27 | 0/27 | 0/27 |
| Accepted under frozen outer completion/protection rule | 13/27 | 17/27 | 24/27 | 24/27 |
| Accepted with no internal or outer protected-file restoration | 12/27 | 15/27 | 24/27 | 24/27 |
| Estimated model cost | $0.22647746 | $0.43459662 | $1.62479240 | $1.78889600 |
| Mean actor time | 87.6 s | 98.7 s | 63.6 s | 56.2 s |
| Implementation repairs / expert takeovers | 1 / 0 | 0 / 0 | — | — |

The primary replay completed all 54 attempts and graded all 54 sources, with no unknown primary costs or ungraded sources. Its model-usage estimate totals **$2.22349262**. Coding ran from October 24, 2026, 00:15:48 to 01:02:04 UTC; candidate grading followed closure. Paired results were 17 both pass, seven native-only passes, zero V11-only passes and three both fail. Scores are preserved without task removal, rescoring or retries funded by private outcomes.

## What changed from V10

V11 retains Pi, workspace/development tools and JS/TS symbol navigation. It supplies original public helpers/interfaces to its reviewers, allows separate citations to public source, retries malformed generated tests once, and adds one bounded verification-recovery review. It quarantines disputed assertions until public evidence establishes whether code or test is wrong. These changes were frozen before this replay; the [protocol](../docs/V11-POLY27-PROTOCOL.md) and archived source define the candidate actually tested.

There were **zero writer retries, two verification-recovery calls, zero implementation repairs and zero expert takeovers**. The two recovery calls remained ambiguous. Three other arbitrations corrected two syntax errors and one expected value in generated checks without changing worker source. All seven formerly unverified V10 tasks reported completion this time, including Go word-search and Java satellite, whose sources still failed canonical grading. More reported completions therefore do not establish better correctness.

Exactly four V11 source verdicts changed:

| Task | V10 → V11 | Observed source difference and outcome |
| --- | --- | --- |
| `rust_book-store` | Fail → Pass | V11 handles book IDs 1–5; V10 indexed a five-slot array with IDs 0–4. V11 passes all 18 cases. The public prose did not define the numeric ID convention. |
| `rust_parallel-letter-frequency` | Fail → Pass | V10 filtered ASCII letters; V11 uses Unicode alphabetic characters and Unicode lowercase expansion. This removes a concrete text-handling limitation and passes all 10 cases. |
| `python_proverb` | Pass → Fail | V10 accepted positional words; V11 accepts one sequence. Canonical calls unpack words as positional arguments. V11 fails all eight cases. |
| `python_connect` | Pass → Fail | V10 accepted multiline strings and row sequences; V11 iterates its argument directly as rows. Canonical multiline strings become character rows, causing four of ten cases to fail. |

Both new unverified cases selected the **`initial` implementation checkpoint**. Neither was restored to the original stub, and neither underwent a code repair. Their sealed sources contain working verse-generation/BFS logic but choose the wrong calling/input convention for the canonical consumer. The public skeleton/prose did not settle those Python representations; both arbiter and recovery abstained. The resulting incompatibilities are real frozen-suite failures, even though missing public API detail limits what they establish about the underlying algorithms.

Fresh native also changed two task verdicts while keeping its total at 24: `cpp_phone-number` changed from fail to pass, while `cpp_all-your-base` changed from pass to fail. The former now matches the canonical exception type; the latter returns `[0]` where the suite expects an empty digit sequence. These two native draws demonstrate outcome variation. One draw per arm cannot attribute V11's individual gains or losses solely to the controller changes.

## Remaining failures and contract limits

The original public inputs and all canonical assertions were retained deliberately. Some hidden exercise tests supply API details absent from the visible prose/starter. These omissions affect both versions and native; they are not grounds to erase failures or claim the saved programs are generally correct.

| V11 task | Canonical result | Post-run diagnosis |
| --- | ---: | --- |
| `cpp_all-your-base` | 15/17 | Returns `[0]` for zero digits; canonical zero representation is `[]`, not specified by the visible interface/prose. Fresh native also fails zero/empty representation cases. |
| `go_word-search` | 0/25 | Returns one-based `(row, column)` coordinates; canonical coordinates are zero-based `(column, row)`. The visible skeleton/prose did not define that convention. |
| `java_affine-cipher` | 14/16 | Correct exception category but different exact message text; required literal was not supplied publicly. |
| `java_all-your-base` | 11/20 | Rejects empty digits and differs on eight exact validation-message assertions. Public instructions omitted those requirements. |
| `java_satellite` | 8/9 | One exact message mismatch: “contain the same elements” versus canonical “have the same elements.” |
| `javascript_alphametics` | 2/9 | Parser accepts single `=` from the visible examples; canonical valid strings use `==`. |
| `javascript_two-bucket` | 7/10 | Rejects impossible goals in `solve()`; canonical requires constructor-time rejection. Fresh native fails the same three cases. |
| `python_go-counting` | Collection fails | Canonical imports `WHITE`, `BLACK`, `NONE`; these exports were absent from the public starter/contract. Fresh native has the same collection failure. |
| `python_proverb` | 0/8 | Positional-argument versus sequence convention; returned unverified. |
| `python_connect` | 6/10 | Multiline-string versus row-sequence convention; returned unverified. |

Eight V11 sources reported completion while failing the canonical consumer. Its generated checks still leave substantial gaps. The replay supports improved handling of verification metadata and fewer abstentions, with **no demonstrated accuracy gain**. A separate future evaluation should publish complete public API conventions and preserve existing repository tests, then withhold new acceptance cases. It must be frozen separately; this cohort remains unchanged. Actual SWE-bench Pro work is separate from these numbers.

The two internal restorations were `Cargo.lock` on Rust pig-latin and decimal. Both sources passed canonical grading. The outer rule counts 17 accepted/completed V11 attempts; excluding either layer's restoration gives the supplemental 15. V10's corresponding numbers were 13 and 12. Recorded Cargo commands are consistent with lockfile normalization; the transient pre-restoration bytes were not sealed, so their exact historical delta is not proved.

## Protocol, cost and evidence

Both arms received the same original 27 public exercises and a 50-minute deadline, two CPU cores and 3 GiB memory per nonroot container, with preinstalled offline dependencies and model-service-only network access. Canonical tests/reference solutions were absent from actor mounts. All 27 stubs failed and all 27 references passed before freezing, covering 460 canonical cases per arm. After all actors closed, sealed patches were replayed onto fresh public baselines in offline graders.

V11 uses Pi 1.2.0, GPT-6 Luna high for implementation and GPT-6.1 Sol low for independent tests/arbitration/recovery; optional Sol high takeover was unused. Fresh native uses Codex CLI 0.164.0 with GPT-6.1 Sol high. There is no practical dollar cap. Prices are API-equivalent usage estimates from frozen catalog metadata, not subscription charges. Native aggregate receipts cannot establish per-request long-context surcharges or independent per-response backend identity; requested model/effort and complete usage were recorded.

Setup is separate from primary results: the completed r1 canaries cost **$0.03210570**, and r2 canaries cost **$0.03046270**, totaling **$0.06256840**. Docker Desktop stopped during the first two r1 exercise actors; both were preserved as interrupted and never candidate-graded. Their additional model usage is **unknown, not zero**, and is excluded from the primary comparison. The successful r2 run used a fresh root; interrupted evidence, partial sources and recovery notes remain archived.

The [audit](poly27-v11-20261023-r2/audit.json) passed with zero issues: 54 exact source inventories/patch hashes, 61 Pi stages containing 296 complete-usage messages, all 27 raw native receipts, all 54 candidate grader receipts and all 54 baseline/reference grader receipts were reconciled. [Independent review](poly27-v11-20261023-r2/audit-review.json) includes the original V10 comparison and both native draws. The frozen plan SHA256 is `c44292f1c3b3ca8e6a28393edff9d1fd7712d34800311a41125b3ed397f52102`.

Full [27-task CSV](poly27-v11-20261023-r2/task-results.csv), [summary](poly27-v11-20261023-r2/summary.json), [grades](poly27-v11-20261023-r2/grades.json), [plan](poly27-v11-20261023-r2/plan.json), and [closure](poly27-v11-20261023-r2/execution-complete.json) accompany the [results archive](poly27-v11-20261023-r2/results-evidence.zip) and [runtime archive](poly27-v11-20261023-r2/runtime.zip). The [inventory](poly27-v11-20261023-r2/evidence-files.json) and [archive receipt](poly27-v11-20261023-r2/archive.json) bind selected bytes. Python's independent CRC/SHA audit verified all 4,155 ZIP entries: 4,124 result entries and 31 runtime entries. Credentials, host homes, dependency caches and generated binaries are excluded.
