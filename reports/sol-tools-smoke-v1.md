# Tool efficiency: sol-tools-smoke-v1

1/1 attempts completed. All workers use GPT-6.1 Sol, low reasoning. Infrastructure smoke on an old subset task; excluded from the main comparison.

| Configuration | Accepted / attempted | Mean estimated cost (known runs) | Cost change vs matched control | Mean seconds | Mean turns |
|---|---:|---:|---:|---:|---:|
| combined | 1/1 | $0.05144 (1/1) | unknown (0 pairs) | 46.8 | 5.0 |

Cost comparisons include every matched attempt with complete cost telemetry, including failures; success rates are separate. Unknown totals are not zero. Costs are API-equivalent subscription estimates, not invoices. Cached prefixes are not forcibly warmed or reset.

## Mechanism activation

| Configuration | Formatted responses | Navigation calls | Full-output retrievals | Output characters removed locally | Mean uncached input | Mean cached input | Mean output |
|---|---:|---:|---:|---:|---:|---:|---:|
| combined | 0 | 4 | 0 | 0.0% | 20580 | 9984 | 928 |

Local output reduction compares each run’s actual raw printed tool responses with its formatted responses. It does not measure cross-arm token savings: different runs may read different code or print different data. Provider usage and matched total costs are the economic outcome.

## Paired correctness

- combined: 0/0 versus control 0/0; lost passes: none; gained passes: none.

## Individual runs

| Task | Repetition | Configuration | Status | Hidden tests | Regressions | Estimated cost |
|---|---:|---|---|---|---|---:|
| prerelease-subset | 1 | combined | completed | passed | passed | $0.05144 |

## Boundaries

- This is an infrastructure smoke, not an efficacy comparison.
- The smoke task was already used in the previous campaign.
- Compact formatting preserves programmatic structured tool APIs. Only printed observations sent to the model change; full originals remain recoverable. Source code is not summarized or deleted.
- Navigation uses Acorn ASTs for exact symbol ranges and syntactic reference candidates. It is not a complete semantic call graph. Parse failures and omitted results are explicit.
- Existing read/search/edit/test tools remain available in all configurations. Navigation availability plus its short usage guidance constitutes the navigation treatment.
- No history pruning, watcher, model routing, learned selector, or extra model calls are used.
- Hidden acceptance and upstream reference solutions remain outside model-accessible workspaces. Old regression groups are adapted to Node test, not the complete TAP suite.
- Main inputs and task snapshots are frozen; smoke testing uses an old task and stays separate.
