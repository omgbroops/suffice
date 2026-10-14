# Real repository experiments: semver-control-v1

Completed 42/42 scheduled runs. Repository: [npm/node-semver](https://github.com/npm/node-semver), base efa4be6096c1f9b77d9d27d6132f6220c43b4e31.

Three historical repairs in a real repository. Each task uses the same pre-fix snapshot; reference repairs pass separate hidden checks. This is a narrow historical replay, not a representative real-world benchmark. Public code and fixes may have appeared in training data. Policies were frozen before the campaign; no hidden outcomes are available to workers or reviewers.

| Arm | Completed + accepted / attempted | Accepted patches | Mean estimated cost (known runs) | Total cost / success | Mean seconds | Pruned requests |
|---|---:|---:|---:|---:|---:|---:|
| sol | 6/6 | 6 | $0.0549 (6/6) | $0.0549 | 62.3 | 0 |
| luna | 2/6 | 2 | $0.0047 (5/6) | unknown | 54.2 | 0 |
| luna-review | 6/6 | 6 | $0.0938 (6/6) | $0.0938 | 138.8 | 0 |
| luna-state | 2/6 | 2 | $0.0049 (6/6) | $0.0147 | 61.2 | 0 |
| luna-prune | 2/6 | 2 | $0.0055 (3/6) | unknown | 68.4 | 98 |
| luna-state-prune | 3/6 | 3 | $0.0068 (6/6) | $0.0136 | 54.1 | 68 |
| luna-repro | 2/6 | 2 | $0.0043 (5/6) | unknown | 49.5 | 0 |

All model calls, including review, repair, retries with reported usage, and failed attempts, contribute to cost. Costs are API-equivalent catalog estimates using the existing subscription; no OpenAI API-key fallback. Missing telemetry makes total cost unknown; known components remain lower bounds. Cache warmth is observed, not controlled.

## Experiment 1: worker and review

Compare sol, luna, and luna-review. Review is a fresh read-only Sol session with the task and attempted patch; a concrete repair verdict triggers one bounded Sol repair phase. The reviewer sees neither hidden tests nor their results.

Valid reviews: 6; repair verdicts: 6; incorrect patches approved: 0; initially failing patches rescued: 3.

## Experiment 2: progress state and recoverable pruning

Compare luna, luna-state, luna-prune, and luna-state-prune as a 2x2 design. State records requirements/unresolved issues plus automatic edit and test freshness. Pruning removes only large older read-only outputs, preserves actions/edits/tests and two recent turns, and leaves original evidence recoverable. Pruning activates above 18,000 serialized characters; this is not a tokenizer budget or learned selector.

luna-state: 11 explicit state updates; 0 pruned requests.

luna-prune: 0 explicit state updates; 98 pruned requests.

luna-state-prune: 11 explicit state updates; 68 pruned requests.

## Experiment 3: reproduction-first verification

Compare luna-repro with luna. The worker must define a bounded set of public API assertions before editing; the harness confirms an assertion failure against the frozen original code. Cases then freeze. Success requires both the same reproduction passing afterward and independent acceptance plus regression checks. Reproducer quality is not guaranteed merely by a fail-to-pass transition.

Established failing reproducers: 6/6; passed after edits: 3/6.

## Individual outcomes

| Task | Repetition | Arm | Completion | Hidden checks | Regression | Estimated cost |
|---|---:|---|---|---|---|---:|
| prerelease-subset | 1 | sol | completed | passed | passed | $0.0688 |
| prerelease-subset | 1 | luna | completed | failed | passed | $0.0111 |
| prerelease-subset | 1 | luna-review | completed | passed | passed | $0.1405 |
| prerelease-subset | 1 | luna-state | completed | failed | passed | $0.0037 |
| prerelease-subset | 1 | luna-prune | turn_limit | failed | failed | unknown |
| prerelease-subset | 1 | luna-state-prune | completed | failed | passed | $0.0048 |
| prerelease-subset | 1 | luna-repro | verification_failed | failed | passed | $0.0031 |
| build-metadata | 1 | luna | completed | failed | passed | $0.0033 |
| build-metadata | 1 | luna-review | completed | passed | passed | $0.0857 |
| build-metadata | 1 | luna-state | completed | passed | passed | $0.0044 |
| build-metadata | 1 | luna-prune | turn_limit | failed | passed | unknown |
| build-metadata | 1 | luna-state-prune | completed | passed | passed | $0.0097 |
| build-metadata | 1 | luna-repro | completed | failed | passed | $0.0065 |
| build-metadata | 1 | sol | completed | passed | passed | $0.0628 |
| dotted-prerelease | 1 | luna-review | completed | passed | passed | $0.0559 |
| dotted-prerelease | 1 | luna-state | completed | passed | passed | $0.0035 |
| dotted-prerelease | 1 | luna-prune | completed | failed | failed | $0.0066 |
| dotted-prerelease | 1 | luna-state-prune | completed | passed | passed | $0.0044 |
| dotted-prerelease | 1 | luna-repro | completed | passed | passed | $0.0033 |
| dotted-prerelease | 1 | sol | completed | passed | passed | $0.0372 |
| dotted-prerelease | 1 | luna | completed | passed | passed | $0.0027 |
| prerelease-subset | 2 | luna | completed | failed | passed | unknown |
| prerelease-subset | 2 | sol | completed | passed | passed | $0.0603 |
| prerelease-subset | 2 | luna-repro | verification_failed | failed | passed | $0.0049 |
| prerelease-subset | 2 | luna-state-prune | completed | failed | passed | $0.0078 |
| prerelease-subset | 2 | luna-prune | turn_limit | failed | passed | unknown |
| prerelease-subset | 2 | luna-state | completed | failed | passed | $0.0090 |
| prerelease-subset | 2 | luna-review | completed | passed | passed | $0.1179 |
| build-metadata | 2 | luna-review | completed | passed | passed | $0.0885 |
| build-metadata | 2 | luna | completed | failed | failed | $0.0041 |
| build-metadata | 2 | sol | completed | passed | passed | $0.0696 |
| build-metadata | 2 | luna-repro | verification_failed | failed | passed | $0.0037 |
| build-metadata | 2 | luna-state-prune | completed | failed | passed | $0.0115 |
| build-metadata | 2 | luna-prune | completed | passed | passed | $0.0077 |
| build-metadata | 2 | luna-state | completed | failed | failed | $0.0034 |
| dotted-prerelease | 2 | luna-state | completed | failed | failed | $0.0054 |
| dotted-prerelease | 2 | luna-review | completed | passed | passed | $0.0741 |
| dotted-prerelease | 2 | luna | completed | passed | passed | $0.0022 |
| dotted-prerelease | 2 | sol | completed | passed | passed | $0.0311 |
| dotted-prerelease | 2 | luna-repro | completed | passed | passed | unknown |
| dotted-prerelease | 2 | luna-state-prune | completed | passed | passed | $0.0026 |
| dotted-prerelease | 2 | luna-prune | completed | passed | passed | $0.0022 |

## Scope and limitations

- Real upstream production files and old regression fixtures are preserved; the existing scoped runner places the repository under src/.
- Regression execution adapts upstream fixture groups to Node test (seven in the main campaign; six in the initial smoke); it is not the complete upstream TAP suite, CLI suite, or lint gate.
- Hidden acceptance combines upstream bug examples with additional contract cases; fixed references pass and baseline fails before model trials.
- All repairs may converge on one file despite cross-module investigation; this is larger than the original fixtures but not a long-horizon application task.
- Two repetitions across three issues cannot establish statistical superiority. No controller training or general accuracy advantage is claimed.
- Fresh review is additional compute, not a budget-matched baseline. Compare total cost and latency as well as acceptance.
- Raw local transcripts and credentials stay in ignored storage. Sources, schedule, input hashes and failure evidence are retained.
