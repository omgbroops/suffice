# Suffice: real-repository experiment results

Completed October 14, 2026. **42/42 scheduled attempts finished.** The three proposed experiments were run on historical bugs in [npm/node-semver](https://github.com/npm/node-semver), rather than another invented project.

**The current evidence favors Sol/core as the reliable default.** Luna with Sol review/repair matched its frozen acceptance rate but cost 70.6% more and took 2.23 times as long. The cheaper state/context/verification treatments did not demonstrate a reliable accuracy-preserving efficiency gain.

## Repository and experimental design

- Pinned pre-fix source: `efa4be6096c1f9b77d9d27d6132f6220c43b4e31`.
- Snapshot: 70,707-byte download; 251,488 bytes of extracted nonhidden files; 132 repository files, including 48 production JavaScript files and 2,464 production lines.
- Three historical bugs: prerelease range subsets, long build metadata in ranges, and dotted prerelease increments.
- Two repetitions per task/configuration, with rotated/reversed ordering. All workers use low reasoning effort and the same scoped tools.
- 601 original upstream fixture cases across seven visible regression groups, plus frozen hidden contract checks. Each original task fails hidden acceptance and its upstream reference repair passes.
- No source/configuration tuning during the main campaign. The earlier infrastructure smoke used the subset task and is recorded separately; this is exploratory historical replay, not an untouched holdout benchmark.

## Frozen benchmark results

| Configuration | Accepted completions | Mean estimated cost per attempt | Mean elapsed seconds |
|---|---:|---:|---:|
| Sol/core | 6/6 | $0.05495 (6 known) | 62.3 |
| Luna/core | 2/6 | $0.00467 (5 known) | 54.2 |
| Luna + Sol review/repair | 6/6 | $0.09376 (6 known) | 138.8 |
| Luna + progress state | 2/6 | $0.00490 (6 known) | 61.2 |
| Luna + pruning | 2/6 | $0.00550 (3 known) | 68.4 |
| Luna + state + pruning | 3/6 | $0.00679 (6 known) | 54.1 |
| Luna + reproduction-first | 2/6 | $0.00430 (5 known) | 49.5 |

These are API-equivalent usage estimates from subscription-backed runs, not billed amounts. Known-only means exclude runs with incomplete telemetry and must not be treated as complete cost estimates for those configurations. Costs include review, repair, and reported usage from failed attempts. The known main-campaign cost lower bound is $1.06007; five runs have unknown total cost.

Lower cost per accepted task does not establish an overall improvement when many more tasks fail. For example, state + pruning spent $0.01359 per accepted completion when dividing all six attempts' cost by its three successes, but its acceptance rate was 50%, compared with Sol's observed 100%. These six observations per configuration are not population accuracy estimates.

### Experiment 1: cheap execution, review, escalation

All six Sol reviewers requested repairs, and all six final patches passed frozen acceptance. Three worker patches failed the frozen hidden checks before review and passed afterward. Three already passed those checks, but the reviewer raised additional issues. Thus the review layer did real work; it was not a cheap approval gate on this cohort.

Sol-only already solved all six attempts and was cheaper and faster. There is no measured advantage here from always paying for a Luna attempt before asking Sol to reason about the problem. Review also adds compute, so this is not a budget-matched architecture comparison.

### Experiment 2: progress state and recoverable context pruning

The 2x2 comparison was Luna, Luna + state, Luna + pruning, and Luna + both. State explicitly recorded requirements/unresolved issues and automatically tracked edits and test freshness. Pruning removed large older read-only outputs, retained recent turns and edit/test results, and kept original evidence recoverable.

Pruning actually ran: 98 requests in pruning-only and 68 in the combined arm. Unlike the earlier synthetic experiment, inactivity cannot explain these results. Three pruning-only attempts exhausted their turn budgets. State-only finished 2/6, equal to the plain Luna score; state + pruning finished 3/6. Its one extra success is insufficient to establish a stable improvement. State-only's two first-repetition successes both failed on repeat.

### Experiment 3: reproduction-first verification

All six attempts established a failing public API reproducer before editing. Three made their reproducer pass afterward, but only two passed independent acceptance. The third demonstrates the risk of solving the generated example without satisfying the full requested behavior. Three other runs left their own reproducer failing and were marked verification failures.

This provides useful completion evidence, but did not improve the observed success rate over Luna/core. The implementation is a declarative semver API test gate, not a general arbitrary-test-generation system.

## What the post-run review audit found

The original benchmark scores above remain unchanged. After the campaign, reviewer examples were executed against preserved before/after patches, the original repository, and upstream reference fixes. These checks were selected after seeing reviews and cannot be presented as held-out evaluation.

- One build-metadata patch passed frozen tests but newly accepted malformed metadata such as `1.2.3+foo!` and `1.2.3+a..b`. The old code rejected those inputs; review/repair restored that behavior.
- Both reviewed dotted-prerelease patches passed frozen tests but broke consecutive `SemVer.inc()` calls on the same instance. The baseline passed these diagnostics, and the review repairs restored them. The upstream reference fix also fails these particular diagnostics, showing why matching a historical fix is not sufficient validation. Sol-only passed the same instance-increment checks in both runs.
- The review also mentioned `+foo` as malformed standalone metadata. Both the original and upstream reference accept it; this was **not a new regression** and is not counted as evidence of a repair benefit.

The useful next evaluation improvement is therefore stronger preservation-of-behavior checks, especially stateful API sequences and malformed inputs. The existing six-attempt scores should not be reinterpreted as proof that every accepted patch is correct.

## Recommendation

Keep the shorter-prompt/codemode Sol core as the reference implementation. Keep reviewers as an optional correctness tool, with their cost measured explicitly. Do not promote pruning or a learned watcher based on this cohort, and do not train a controller on three issues.

For the next campaign, use fresh issues and freeze stronger regression/property checks before any model runs. Test narrowly bounded cheap-model assistance to a Sol worker, rather than assuming a cheap full-task attempt will save money. The earlier synthetic 30–34% core-versus-Pi savings remain a separate result; this campaign did not remeasure that comparison.

## Verification and operational record

- 68 harness tests passed.
- All 22 frozen source/configuration inputs and their saved copies match their hashes; all 405 baseline workspace files match; all 42 result records exist; all final patches match their saved evidence; no immutable-file violations.
- The actual generation models were only `gpt-6.1-sol` and `gpt-6-luna`. No Jev or OpenRouter calls were made.
- A recovered 503 contained `subscription_sharing_user_unavailable`, triggering the conservative authorization/usage stop check after attempt 40. After a cooldown, the unchanged campaign resumed only the two unattempted entries. The failed request remains recorded and that run's total cost remains unknown. No failed attempts were replaced.
- Raw evidence for the main campaign and smoke checks occupies about 18.84 MiB. Credentials and raw transcripts remain ignored. Private comparisons found no actual credential values in reviewable files.
- No full Git history, model weights, container images, or new benchmark dependency installation was required. No upstream changes were published.

## Files and reproduction

- [Full per-run report](semver-control-v1.md) and [aggregate JSON](semver-control-v1.json)
- [Integrity receipt](semver-verification.json)
- [Before/after review audit](semver-review-audit.json) and [post-hoc diagnostic results](semver-review-diagnostics.json)
- [Frozen protocol](../docs/REAL-EXPERIMENT.md)
- Raw transcripts, workspaces, hashes and patches: `.suffice/real-runs/semver-control-v1/`

To prepare the exact source snapshot: `node scripts/fetch-real.mjs`, then `node scripts/prepare-real.mjs`. The fetch helper verifies a pinned SHA-256 and caps downloads at 2 MiB. Use a new campaign name for future trials; never overwrite `semver-control-v1`.
