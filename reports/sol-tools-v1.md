# Tool efficiency: sol-tools-v1

48/48 attempts completed. All workers use GPT-6.1 Sol, low reasoning.

| Configuration | Accepted / attempted | Mean estimated cost (known runs) | Cost change vs matched control | Mean seconds | Mean turns |
|---|---:|---:|---:|---:|---:|
| control | 12/12 | $0.04267 (12/12) | 0.0% (12 pairs) | 39.1 | 4.7 |
| compact | 12/12 | $0.03541 (11/12) | -19.8% (11 pairs) | 35.4 | 4.8 |
| navigation | 12/12 | $0.03322 (11/12) | -24.8% (11 pairs) | 38.4 | 5.1 |
| combined | 12/12 | $0.03445 (12/12) | -19.3% (12 pairs) | 37.5 | 5.2 |

Cost comparisons include every matched attempt with complete cost telemetry, including failures; success rates are separate. Unknown totals are not zero. Costs are API-equivalent subscription estimates, not invoices. Cached prefixes are not forcibly warmed or reset.

## Mechanism activation

| Configuration | Formatted responses | Navigation calls | Full-output retrievals | Output characters removed locally | Mean uncached input | Mean cached input | Mean output |
|---|---:|---:|---:|---:|---:|---:|---:|
| control | 0 | 0 | 0 | 0.0% | 16619 | 10869 | 835 |
| compact | 41 | 0 | 0 | 15.4% | 12678 | 9941 | 843 |
| navigation | 0 | 42 | 0 | 0.0% | 11197 | 15605 | 851 |
| combined | 44 | 43 | 0 | 17.8% | 12028 | 13909 | 900 |

Local output reduction compares each run’s actual raw printed tool responses with its formatted responses. It does not measure cross-arm token savings: different runs may read different code or print different data. Provider usage and matched total costs are the economic outcome.

## Paired correctness

- compact: 12/12 versus control 12/12; lost passes: none; gained passes: none.
- navigation: 12/12 versus control 12/12; lost passes: none; gained passes: none.
- combined: 12/12 versus control 12/12; lost passes: none; gained passes: none.

## Individual runs

| Task | Repetition | Configuration | Status | Hidden tests | Regressions | Estimated cost |
|---|---:|---|---|---|---|---:|
| numeric-xrange | 1 | control | completed | passed | passed | $0.06688 |
| numeric-xrange | 1 | compact | completed | passed | passed | $0.02782 |
| numeric-xrange | 1 | navigation | completed | passed | passed | $0.03552 |
| numeric-xrange | 1 | combined | completed | passed | passed | $0.05959 |
| caret-prerelease | 1 | compact | completed | passed | passed | $0.02703 |
| caret-prerelease | 1 | navigation | completed | passed | passed | $0.02793 |
| caret-prerelease | 1 | combined | completed | passed | passed | $0.01770 |
| caret-prerelease | 1 | control | completed | passed | passed | $0.03949 |
| prerelease-diff | 1 | navigation | completed | passed | passed | $0.02633 |
| prerelease-diff | 1 | combined | completed | passed | passed | $0.02562 |
| prerelease-diff | 1 | control | completed | passed | passed | $0.02347 |
| prerelease-diff | 1 | compact | completed | passed | passed | $0.03224 |
| numeric-prerelease | 1 | combined | completed | passed | passed | $0.04748 |
| numeric-prerelease | 1 | control | completed | passed | passed | $0.04672 |
| numeric-prerelease | 1 | compact | completed | passed | passed | $0.03331 |
| numeric-prerelease | 1 | navigation | completed | passed | passed | $0.04191 |
| numeric-xrange | 2 | control | completed | passed | passed | $0.06982 |
| numeric-xrange | 2 | combined | completed | passed | passed | $0.04448 |
| numeric-xrange | 2 | navigation | completed | passed | passed | $0.03707 |
| numeric-xrange | 2 | compact | completed | passed | passed | $0.05214 |
| caret-prerelease | 2 | compact | completed | passed | passed | $0.02682 |
| caret-prerelease | 2 | control | completed | passed | passed | $0.02899 |
| caret-prerelease | 2 | combined | completed | passed | passed | $0.02749 |
| caret-prerelease | 2 | navigation | completed | passed | passed | $0.03057 |
| prerelease-diff | 2 | navigation | completed | passed | passed | $0.02256 |
| prerelease-diff | 2 | compact | completed | passed | passed | $0.02656 |
| prerelease-diff | 2 | control | completed | passed | passed | $0.02282 |
| prerelease-diff | 2 | combined | completed | passed | passed | $0.01846 |
| numeric-prerelease | 2 | combined | completed | passed | passed | $0.04084 |
| numeric-prerelease | 2 | navigation | completed | passed | passed | $0.05233 |
| numeric-prerelease | 2 | compact | completed | passed | passed | $0.04479 |
| numeric-prerelease | 2 | control | completed | passed | passed | $0.04012 |
| numeric-xrange | 3 | navigation | completed | passed | passed | $0.03355 |
| numeric-xrange | 3 | combined | completed | passed | passed | $0.05273 |
| numeric-xrange | 3 | control | completed | passed | passed | $0.06912 |
| numeric-xrange | 3 | compact | completed | passed | passed | $0.02880 |
| caret-prerelease | 3 | combined | completed | passed | passed | $0.02174 |
| caret-prerelease | 3 | control | completed | passed | passed | $0.02606 |
| caret-prerelease | 3 | compact | completed | passed | passed | unknown |
| caret-prerelease | 3 | navigation | completed | passed | passed | unknown |
| prerelease-diff | 3 | control | completed | passed | passed | $0.02980 |
| prerelease-diff | 3 | compact | completed | passed | passed | $0.02184 |
| prerelease-diff | 3 | navigation | completed | passed | passed | $0.02223 |
| prerelease-diff | 3 | combined | completed | passed | passed | $0.02108 |
| numeric-prerelease | 3 | compact | completed | passed | passed | $0.06820 |
| numeric-prerelease | 3 | navigation | completed | passed | passed | $0.03540 |
| numeric-prerelease | 3 | combined | completed | passed | passed | $0.03620 |
| numeric-prerelease | 3 | control | completed | passed | passed | $0.04876 |

## Boundaries

- Four fresh historical bugs in npm/node-semver; each uses its own pre-fix revision. Public historical solutions may have been in training data.
- Three repetitions per task/configuration, rotated/reversed ordering. Four tasks do not establish broad software-engineering superiority.
- Compact formatting preserves programmatic structured tool APIs. Only printed observations sent to the model change; full originals remain recoverable. Source code is not summarized or deleted.
- Navigation uses Acorn ASTs for exact symbol ranges and syntactic reference candidates. It is not a complete semantic call graph. Parse failures and omitted results are explicit.
- Existing read/search/edit/test tools remain available in all configurations. Navigation availability plus its short usage guidance constitutes the navigation treatment.
- No history pruning, watcher, model routing, learned selector, or extra model calls are used.
- Hidden acceptance and upstream reference solutions remain outside model-accessible workspaces. Old regression groups are adapted to Node test, not the complete TAP suite.
- Main inputs and task snapshots are frozen; smoke testing uses an old task and stays separate.
