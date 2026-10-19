# Generic Medium accuracy replay

The new treatment accepted **2/3** independently graded patches, the same count as historical v2 Medium, while spending **$0.02359618** versus **$0.00927542**. Mean actor latency increased from **63.473s** to **139.228s**. This replay provides no evidence of an accuracy improvement. Keep the treatment experimental.

| Configuration | Accepted | Complete API-equivalent cost | Cost per accepted task | Mean actor latency | Responses | Tools |
|---|---:|---:|---:|---:|---:|---:|
| Historical v2 Luna Medium | 2/3 | $0.00927542 | $0.00463771 | 63.473s | 41 | 75 |
| New Medium + compatibility review | 2/3 | $0.02359618 | $0.01179809 | 139.228s | 79 | 148 |
| Historical v2 Luna High | 3/3 | $0.02084424 | $0.00694808 | 87.049s | 47 | 124 |
| Historical original v1 Luna High | 2/3 | $0.01598388 | $0.00799194 | 93.202s | 46 | 95 |

These are asynchronous executions on the same three exposed development issues, with one attempt per configuration and issue. They are descriptive comparisons, not contemporaneous randomized controls or held-out evidence. Failed attempts are included in every cost-per-accepted figure. Prices are pinned API-equivalent catalog rates, not a subscription invoice. Engineering inference is outside the campaign cost.

| Task | Independent acceptance | Review result | Correction stages | Total cost | Review cost | Correction cost | Actor latency |
|---|---|---|---:|---:|---:|---:|---:|
| f16 / ws#2230 | Pass | pass | 0 | $0.00409018 | $0.00147688 | $0 | 80.850s |
| f09 / fast-xml-parser#705 | Pass | revised_unreviewed | 1 | $0.01139218 | $0.00172136 | $0.00365928 | 148.973s |
| f11 / commander.js#1863 | Fail | revised_unreviewed | 1 | $0.00811382 | $0.00144930 | $0.00383206 | 187.861s |

All three mandatory reviews ran as fresh Luna Medium sessions with only read/source-navigation/changes tools through codemode. All returned structurally valid source-supported findings or pass verdicts; no review was malformed, inconclusive or skipped, and no review cap was hit. The reviews consumed $0.00464754; the two correction stages consumed $0.00749134. Combined, they accounted for $0.01213888 of total spend. A correction stage is not necessarily an edit: f09's worker inspected the finding, made no further changes, and reran public checks. Corrected outcomes remain explicitly `revised_unreviewed`; there was no second model review.

| Reviewer | Responses / cap | Tools / cap | Actual cost / cap | capHit | stopReason |
|---|---:|---:|---:|---|---|
| f16 | 4 / 6 | 8 / 24 | $0.00147688 / $0.01 | false | null |
| f09 | 6 / 6 | 11 / 24 | $0.00172136 / $0.01 | false | null |
| f11 | 6 / 6 | 13 / 24 | $0.00144930 / $0.01 | false | null |

The sublimit successfully bounded spending, and no attempt failed because a reviewer was forcibly stopped. f09/f11 returned valid final verdicts on their sixth response. Their inspection depth could still depend on the six-response ceiling, but this experiment provides no uncapped comparison and cannot show that raising it would help. The observed problem was ineffective review direction or correction, rather than a recorded cap stop.

All normal controller public checks passed. Conditional Sol advice, ordinary repair and Sol takeover were enabled by the frozen policy but **none activated**. All 79 responses were Luna Medium. Total usage was 148,950 fresh input, 570,368 cached input, zero cache-write and 5,995 output tokens, including 717 reported reasoning tokens with the reasoning field present on 79/79 raw responses. Peak actor process-tree RSS was 350.3 MiB, below the 4 GiB boundary.

Receipt timestamps attribute a mean 135.456s to provider-request-to-assistant intervals, compared with 139.228s total actor latency. Public controller checks averaged 0.433s. These intervals include queueing, network, inference and streaming; they do not isolate provider compute. All new timing pairs reconcile. Review averaged 15.195s, and correction averaged 50.771s per attempt including the task with no correction stage.

The final f11 patch only special-cases help-command dispatch when the parent help option is disabled, leaving the original parent help-flag forwarding path active for other valid child configurations. Independent checks still fail with a short-only child flag (`undefined.length`), disabled child help options, and custom child help flags (`unknown option '--help'`): 11/14 pass, three fail. The public README documents customizable and disabled help options separately from the implicit help command. The reviewer instead raised an executable-subcommand concern; the correction added a branch there but did not address these remaining configurations. Passing ordinary tests and a source-supported review finding therefore did not establish compatibility.

Implementation and synthetic tests were frozen before inference at commit `b7eaeac4f4684fb7b5deb1036a4f89d5e68133c4`. Manifest SHA-256: `d90626e083cfd289989fb541a555adf46fd793cab47d92f9ec859a19ee847423`. The three attempts used the same original public prompts, dependencies, independent graders and limits: $0.25 / 300s / 40 responses / 160 tools / 4 GiB, at most two actors. Reviewer limits were $0.01 / 60s / six responses / 24 tools within the global allowance. No reruns or outcome-driven tuning occurred.

All three fresh base-fail/reference-pass/networked-public controls passed. Postflight verified 90 frozen inputs and 53 source-sync files; prior executable source and public prompts remain byte-identical. Every base repository exposes one reachable commit and no fixing commit. The filtered local export contains 233 receipts (2,803,121 bytes), retaining provider usage, stage/review data, patches, checks, controls and independent grades. Credentials, actor/grading workspaces and dependencies were excluded. All 79 responses reprice independently, all receipt hashes match, all costs are known, and `audit.json` reports `allChecksPassed: true`.

Artifacts: [summary.json](summary.json), [comparison.json](comparison.json), [audit.json](audit.json), [attempts.csv](attempts.csv), [public-contracts.json](public-contracts.json), [export-manifest.json](export-manifest.json).
