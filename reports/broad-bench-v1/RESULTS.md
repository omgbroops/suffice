# Fifteen-issue broad benchmark

Completed **60/60 attempts** on Sonion: 15 historical issues across 10 JavaScript/TypeScript repositories, four frozen configurations, one attempt per issue and configuration. The final 51 attempts continued under the explicit capacity-accounting amendment in `review/broad-continuation.md`. No attempts were rerun.

The inexpensive Luna strategy remains a strong cost/quality tradeoff. This campaign does **not** demonstrate that the added v2 bundle improves accuracy over existing Suffice on the same Luna model.

| Configuration | Strict accepted patches | Policy-valid successes | Recorded API-equivalent cost | Mean actor seconds | Median actor seconds |
| --- | ---: | ---: | ---: | ---: | ---: |
| Native Codex / Sol Medium | 11/15 | 10/15 | at least $1.72148720 | 74.8 | 66.1 |
| Suffice v1 / Sol Medium | 11/15 | 11/15 | $1.02299960 | 61.3 | 48.6 |
| Suffice v2 / Luna High | 10/15 | 10/15 | $0.07232666 | 93.5 | 89.6 |
| Suffice v1 / Luna High | 9/15 | 9/15 | at least $0.06697234 | 85.6 | 80.0 |

**Grading caveat:** b02 contains an extra bare, unquoted hash-preservation assertion that follows the upstream patch's chosen comment grammar, but exceeds the original JSON issue and baseline documented behavior. All four patches pass the preceding LF JSON preservation, JSON parsing and nested-JSON assertions, then fail that extra rule. Later checks and the CRLF iteration were not reached. Frozen scores remain unchanged; b02 should not be described as a demonstrated failure to repair the core JSON issue. These strict scores are not clean real-world issue-resolution rates.

Strict acceptance requires the restored public checks and frozen independent behavioral checks. Policy-valid success also requires operational completion, complete usage receipts and the common resource allowances. The provider-interrupted Codex b04 patch passed acceptance but was not policy eligible. The tables retain every failure and its cost.

All recorded response usage totals **$2.88378580**. Two original provider-capacity failures have unknown whole-attempt costs, so this is a lower bound, not an invoice or exact campaign total. Suffice v2 and v1 Sol have complete costs. Their all-attempt cost per strict accepted task is **$0.007232666** and **$0.092999964**, respectively: v2 costs 92.22% less per accepted task on this sample, with 10 accepted patches versus 11. Exact cost per accepted task for native Codex and v1 Luna remains unavailable.

V2 recorded 95.80% less spending than native Codex, while native Codex accepted one more patch. That recorded-spend comparison is not an exact invoice comparison. The matched Sol comparison is also informative: v1 and native Codex accepted the same 11 issues; v1 recorded 40.57% less cost. Model choice accounts for much of the additional Luna saving.

## Same-model control and runtime

With Luna High in both arms, v2 accepted 10/15 versus baseline v1 9/15. The paired outcomes are eight shared passes, four shared failures, v2-only passes on b03 and b06, and a v1-only pass on b10. Baseline b03 was interrupted by provider overload.

As an explicitly **post hoc sensitivity analysis**, excluding that capacity-affected issue yields **9/14 accepted for each Luna arm**, with one distinct win each. On those 14 fully accounted pairs, v2 cost $0.06893062 versus v1 $0.06678504 (**3.21% more**), and mean actor runtime was 93.07 versus 90.78 seconds (**2.53% slower**). This does not replace the primary 15-issue results.

V2 mean actor runtime was 93.51 seconds, compared with native Codex 74.82 seconds (about 25% slower) and v1 Sol 61.28 seconds (about 53% slower). Independent grading, preparation and queue admission are outside actor runtime. These are descriptive timings with concurrent service load and one attempt per issue.

## Actual treatment activation and usage

All v2 attempts used the preserved thin profile with output control, compact guidance, prepared context and notices. **No Sol advice, bounded repair or Sol takeover activated** in any of the 15 v2 attempts. The results do not validate routing, advice quality or expert escalation. These features stayed configured to trigger from public execution evidence, not private acceptance tests.

| Configuration | Usage-bearing responses | Observed provider requests | Fresh input | Cached input | Output | Reasoning output included in output |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Native Codex / Sol Medium | 141 | unobserved | 504,545 | 3,359,872 | 37,641 | 9,731 |
| Suffice v1 / Sol Medium | 110 | 110 | 338,724 | 982,016 | 24,735 | 4,017 |
| Suffice v2 / Luna High | 190 | 190 | 371,629 | 1,896,576 | 32,396 | 15,448 |
| Suffice v1 / Luna High | 163 | 164 | 378,569 | 1,318,144 | 31,868 | 15,413 |

Baseline Luna has 165 assistant event rows, including two error/abort rows, but only 164 observed provider requests and 163 usage-bearing responses. Those counts must not be called 165 billed model calls. Native Codex request attempts are unobserved; its 141 completed usage records are not proof that only 141 requests were attempted. Detailed latency, cache, reasoning, tool and resource receipts are in `summary.json` and `analysis.json`.

## Failures and limits

Native Codex and v1 Sol failed the same strict acceptance cases: b02 (the additional dotenv bare-hash rule described above), b08 (execa inherited input), b11 (ANSI hyperlink terminators), and b14 (micromatch Windows paths). V2 additionally failed b10 (ANSI cursor save/restore). Baseline Luna additionally failed b06 (minimatch globstar) and suffered the b03 capacity interruption, while passing b10. All five v2 failures passed the public checks and failed an independent check; private failure evidence never fed back into a repair. See `failures.json`.

Each attempt retained a $0.25 nominal API-equivalent allowance, 300-second actor allowance, 40-response/160-tool limits and 4 GiB process-tree RSS allowance. The campaign kept maximum four counterbalanced issue blocks and memory admission. No budget/resource stop was recorded. Missing cost reserves were admission allowances, not verified billing bounds.

The two retained gaps are b03-v1LunaHigh (overload, automatic SDK retry, then cancellation) and b04-codexSolMedium (six accounted responses, accepted patch, then capacity failure without a final aggregate). All new 51 attempts have complete accounting. Neither missing response cost was replaced with zero.

## Integrity, provenance and limitations

The final audit verifies 60 unique attempts, all 15 baseline/reference controls, 174 frozen source/runtime/evaluator hashes, 78 original local/Sonion source files, seven observer files, and 4,180 exported file hashes. All 2,813 files in the original nine remote attempt directories retain their starting hashes. Every recorded cost independently reprices and model/effort identity checks pass. `audit.json` correctly retains an incomplete-accounting failure for the unmatched baseline Luna error rows; `continuation-audit.json` separates source/receipt integrity from whole-attempt cost completeness.

The original Suffice `main` checkout is unchanged. Frozen harness implementation, models, prompts, grading and limits did not change during inference; only the separately recorded continuation/observer policy was added. Reports and observer sources are on `codex/suffice-v7-experiments`. Raw sessions, package payloads and credentials are not committed; raw benchmark receipts remain under the local and remote `.suffice/broad-bench-v1` directories.

This is a small, single-attempt, predominantly functional JavaScript/TypeScript cohort. Historical public issues may have appeared in model training. It does not establish population accuracy, cross-language performance, additive feature contributions or production readiness. No default setting was enabled or harness tuned to these outcomes.
