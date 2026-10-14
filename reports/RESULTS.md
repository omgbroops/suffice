# Suffice: first experiment results

Updated 2026-10-14T07:51:50.356Z. GPT-6.1 Sol, low reasoning, pinned Pi 1.2.0. These are small AI-authored synthetic tasks, not a real-world coding benchmark.

## Execution

| Campaign | Attempted / scheduled | Accepted | Main-provider failures | Other failures |
| --- | --- | --- | --- | --- |
| pilot-low-v3 | 32/32 | 29 | 3 | 0 |
| holdout-low-v3 | 16/16 | 16 | 0 | 0 |

Provider failures are availability outcomes, not evidence of model inability. Earlier integration and medium-effort runs are preserved separately.

## Core versus direct-tool Pi baseline

The core bundle uses a shorter stable prompt and Pi codemode-only tool execution. All arms use the same restricted workspace tools. This is a Pi SDK baseline, not an unrestricted stock CLI comparison.

| Campaign | Matched accepted pairs with complete cost | Model-cost change | Main-call change | Main-token change |
| --- | --- | --- | --- | --- |
| pilot-low-v3 | 4 | -29.6% | -36.0% | -29.9% |
| holdout-low-v3 | 4 | -34.0% | -38.5% | -36.5% |

Negative means lower than baseline. Costs are API-equivalent estimates, not subscription invoices. Cache warmth is not fully controlled; small samples and successful-pair selection prohibit a general superiority claim.

## Watcher behavior

| Campaign | Variant | Accepted / attempted | Watcher calls | Injections | Planned candidates skipped | Clean cost pairs vs core | Cost change vs core |
| --- | --- | --- | --- | --- | --- | --- | --- |
| pilot-low-v3 | rules | 3/4 | 3 | 0 | 0 | 3 | -1.0% |
| pilot-low-v3 | luna | 3/4 | 3 | 3 | 0 | 3 | -13.3% |
| pilot-low-v3 | jev | 3/4 | 3 | 3 | 0 | 2 | -10.9% |
| pilot-low-v3 | lightning | 4/4 | 4 | 4 | 0 | 4 | 2.6% |
| pilot-low-v3 | nemotron | 4/4 | 4 | 3 | 0 | 4 | 10.3% |
| pilot-low-v3 | jev-gated | 4/4 | 0 | 0 | 4 | 4 | -2.9% |
| holdout-low-v3 | jev | 4/4 | 4 | 4 | 0 | 3 | 14.6% |
| holdout-low-v3 | jev-gated | 4/4 | 0 | 0 | 4 | 4 | 19.6% |

A watcher call often selected a file already named in the current read program. The gated Jev variant suppresses those calls. When it makes zero calls, its results do not establish Jev decision quality; it effectively behaves like core. No watcher accuracy advantage has been demonstrated on this easy task set.

Gemma 4 26B A4B free remained HTTP 429 during availability checks, so no comparative coding-performance result is claimed for it. Both NVIDIA free endpoints worked with the corrected OpenRouter key.

## Spend and storage

Jev known usage-based estimate across smoke and coding runs: $0.000461. Unknown Jev call costs: 0. Conservative ledger reserves: $0.10 / $2.00. Reserves are not measured spend.

Recorded coding attempts including integration/debugging: 79. Current free disk: 16.92 GiB. Dependencies are about 112 MB; no model weights or container images were downloaded.

## Recommendation

Keep the core bundle as the next baseline. Keep learned watchers experimental and gated. The next useful experiment needs larger real-repository tasks with genuinely uncertain retrieval, repeated trials, and independent acceptance; these fixtures are too easy to establish an accuracy moat.

## Evidence

- [Pilot report](pilot-low-v3.md)
- [Held-out report](holdout-low-v3.md)
- [Protocol](../docs/EXPERIMENT.md)
- Frozen source, manifests, task states, events and verification remain under ignored `.suffice/runs/` on this machine. Credentials and raw local evidence are not included in these aggregate reports.
