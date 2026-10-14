# Sol tool efficiency: completed comparison

Completed October 14, 2026. **48/48 attempts finished, and all 48 passed frozen acceptance and regression checks.** Four new historical bugs in npm/node-semver were each attempted three times using the same GPT-6.1 Sol worker at low reasoning effort.

**Navigation-only was the cheapest configuration on this cohort.** Compact responses also reduced observed costs. Combining them did not improve on either individual treatment in the common complete-cost comparison.

## Matched cost comparison

Two attempts recovered from 503 connection failures but lack complete cost telemetry. They remain in all correctness counts. For a fair four-way monetary comparison, the table below uses the same **11 task/repetition groups** with complete telemetry in every configuration; it does not replace or discard any attempt from the experiment record.

| Configuration | Frozen acceptance | Mean estimated cost on common 11 groups | Change versus control |
|---|---:|---:|---:|
| Sol/core control | 12/12 | $0.04418 | baseline |
| Compact printed responses | 12/12 | $0.03541 | **19.8% lower** |
| AST code navigation | 12/12 | $0.03322 | **24.8% lower** |
| Both together | 12/12 | $0.03561 | **19.4% lower** |

Costs are API-equivalent estimates from the existing subscription, not billed amounts. The main campaign's recorded cost lower bound is $1.73248; the exact total is unknown because of the two failed requests. The original per-arm analysis, which uses 12 complete pairs for combined and 11 for the other treatments, reports combined as 19.3% cheaper. The common-group table above aligns all four denominators.

All-pass outcomes establish no observed accuracy loss on these checks, not a general 100% accuracy guarantee. These are four historical issues in one small real repository; the tasks may have appeared in training data. Cache warmth was observed, not controlled, and pauses can affect cache availability. No statistical superiority claim is made.

## What changed

### Compact responses alone

The formatter changes printed observations after a JavaScript tool program completes. It preserves the machine-readable tool API, so existing programs using fields such as `result.text` continue to work. Source lines and omission counts stay intact; successful test output becomes a short status/count summary; failures retain actionable diagnostics. Original observations and full test logs are recoverable by reference.

There were **41 formatted responses**, reducing their runs' printed output size by **15.4%** relative to the actual raw outputs. No full-observation recovery was requested. This local character reduction is a mechanism check, not itself a token-cost estimate.

On the common complete-cost groups, recorded uncached input averaged about **12,926 tokens**, versus **17,405** for control. The worker can also change its behavior in response to presentation; the full-task saving cannot be attributed solely to removed JSON characters.

### Navigation alone

Three tools use Acorn syntax trees to find functions, class methods and bindings, read exact symbol ranges with imports, and locate syntactic references. Indexes refresh after edits. Ordinary file reads/searches remain available. Reference matches are candidates, not a fully resolved semantic call graph.

Navigation was invoked **42 times**. Its common-group uncached input averaged about **11,534 tokens**, while the model and reasoning effort stayed unchanged. This treatment used slightly more model generations on average than control, so its saving came with smaller/cheaper context rather than simply fewer model calls. It made no extra watcher, selector, or routing-model calls.

### Both together

The combined arm used **43 navigation calls** and **44 formatted responses**. Its local printed-output reduction was **17.8%**, and common-group uncached input averaged about **12,556 tokens**. No full-observation recovery was requested.

Despite activating both mechanisms, combined cost was higher than navigation-only. The features affect investigation choices and subsequent context, so their isolated cost reductions should not be added together.

## Task differences

| Task | Main observation |
|---|---|
| Numeric components after wildcards | Navigation reduced mean cost from about $0.0686 to $0.0354 across three repeats. Compact-only was close at $0.0363; combined was $0.0523. |
| Exact caret prerelease lower bounds | All treatments were cheaper on the common complete-cost pairs; combined had the strongest saving for this task. One compact and one navigation run have unknown total cost. |
| Prerelease-to-stable diff classification | The small target function offered less navigation benefit. Compact-only was about 6% more expensive on average; combined was about 14% cheaper. |
| Digit-prefixed prerelease identifiers | Compact-only was about 8% more expensive on average; navigation and combined were modestly cheaper. |

The aggregate improvements are real observations from this cohort, but they are not uniform across tasks. In particular, the larger range-parser task contributes substantially to the savings.

## Verification

- **77 harness tests passed**, including source preservation, failure diagnostics, full-output recovery, unchanged programmatic tool results, batched output formatting, symbol ranges, stale-index invalidation, parse fallbacks, and provider-error classification.
- All **48 patches** passed the frozen hidden checks and the existing seven-group regression adapter.
- A separate supplemental check ran the original upstream `diff()` and `coerce()` TAP test bodies through a small assertion adapter: **245–264 assertions per workspace**, depending on its revision. All **48 patches passed**, as did all original/reference snapshots. These tests were selected after the campaign began, before inspecting candidate patches; they are supplementary evidence, not retroactively added primary scoring.
- All **26 frozen input records** and saved copies were verified, accounting for the documented operational-runner amendment. All **532 baseline files** match; saved final patches match workspace contents; there are no immutable-file violations.
- Actual generation models were exclusively `gpt-6.1-sol`. No Jev/OpenRouter inference was used.

## Storage and operational amendment

After 20 runs, the original 5 GiB free-space floor stopped the campaign when the machine had about 2.8 GB free. The current experiment then occupied only about 9 MB. A recorded resource-only amendment retained a **1 GiB free-space reserve** and added a **100 MiB campaign-artifact cap**. Only the operational runner changed; model prompts, tools, dependencies, task snapshots, acceptance, schedule, reasoning, per-run limits and spending cap stayed identical. Only the 28 unattempted entries resumed.

The original runner is retained in the frozen snapshot, and the original/current hashes and amendment time are in the integrity receipt. This operational change and pause are disclosed rather than silently treating the entire configuration as unchanged.

All tool-efficiency raw evidence, including two smoke runs and their frozen snapshots, occupies about **17.9 MiB**. The four source downloads total 276,765 bytes; the two parser packages total about 622 KB unpacked. Other projects and files were not removed. Raw transcripts and credentials remain ignored.

## Recommendation

Carry **navigation-only** forward as the leading candidate for the next validation cohort. Keep compact formatting independently selectable: it also saved money overall and is smaller in scope, but it did not help every task. Keep the combined mode experimental; this trial does not justify making both mandatory.

Before treating the result as a broad product claim, repeat on fresh issues in another repository, including harder tasks where Sol is not already at the acceptance ceiling. Preserve the same frozen-test and complete-cost accounting. These savings should not be multiplied by earlier synthetic core-versus-Pi percentages from a different dataset.

## Artifacts

- [Full per-run report](sol-tools-v1.md) and [aggregate data](sol-tools-v1.json)
- [Integrity, common-cost comparison, task breakdown and amendment receipt](sol-tools-verification.json)
- [Supplemental regression results](sol-tools-extra-regressions.json)
- [Original frozen protocol](../docs/TOOL-EFFICIENCY.md)
- Implementation: [response formatting](../src/tool-observations.mjs), [navigation](../src/symbol-navigation.mjs), [runner](../scripts/efficiency-experiment.mjs)
- Raw evidence: `.suffice/efficiency-runs/sol-tools-v1/`

All model runs have finished. Existing earlier reports and raw evidence remain preserved.
