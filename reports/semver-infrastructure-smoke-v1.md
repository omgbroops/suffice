# Real repository experiments: semver-infrastructure-smoke-v1

Completed 3/3 scheduled runs. Repository: [npm/node-semver](https://github.com/npm/node-semver), base efa4be6096c1f9b77d9d27d6132f6220c43b4e31.

Three historical repairs in a real repository. Each task uses the same pre-fix snapshot; reference repairs pass separate hidden checks. This is a narrow historical replay, not a representative real-world benchmark. Public code and fixes may have appeared in training data. Policies were frozen before the campaign; no hidden outcomes are available to workers or reviewers.

| Arm | Completed + accepted / attempted | Accepted patches | Mean estimated cost (known runs) | Total cost / success | Mean seconds | Pruned requests |
|---|---:|---:|---:|---:|---:|---:|
| luna-review | 0/1 | 0 | unknown (0/1) | unknown | 117.2 | 0 |
| luna-state-prune | 0/1 | 0 | $0.0088 (1/1) | unknown | 86.0 | 16 |
| luna-repro | 0/1 | 0 | $0.0036 (1/1) | unknown | 79.9 | 0 |

All model calls, including review, repair, retries with reported usage, and failed attempts, contribute to cost. Costs are API-equivalent catalog estimates using the existing subscription; no OpenAI API-key fallback. Missing telemetry makes total cost unknown; known components remain lower bounds. Cache warmth is observed, not controlled.

## Experiment 1: worker and review

Compare sol, luna, and luna-review. Review is a fresh read-only Sol session with the task and attempted patch; a concrete repair verdict triggers one bounded Sol repair phase. The reviewer sees neither hidden tests nor their results.

Valid reviews: 0; repair verdicts: 0; incorrect patches approved: 0; initially failing patches rescued: 0.

## Experiment 2: progress state and recoverable pruning

Compare luna, luna-state, luna-prune, and luna-state-prune as a 2x2 design. State records requirements/unresolved issues plus automatic edit and test freshness. Pruning removes only large older read-only outputs, preserves actions/edits/tests and two recent turns, and leaves original evidence recoverable. Pruning activates above 18,000 serialized characters; this is not a tokenizer budget or learned selector.

luna-state-prune: 2 explicit state updates; 16 pruned requests.

## Experiment 3: reproduction-first verification

Compare luna-repro with luna. The worker must define a bounded set of public API assertions before editing; the harness confirms an assertion failure against the frozen original code. Cases then freeze. Success requires both the same reproduction passing afterward and independent acceptance plus regression checks. Reproducer quality is not guaranteed merely by a fail-to-pass transition.

Established failing reproducers: 1/1; passed after edits: 0/1.

## Individual outcomes

| Task | Repetition | Arm | Completion | Hidden checks | Regression | Estimated cost |
|---|---:|---|---|---|---|---:|
| prerelease-subset | 1 | luna-review | turn_limit | failed | passed | unknown |
| prerelease-subset | 1 | luna-state-prune | completed | failed | passed | $0.0088 |
| prerelease-subset | 1 | luna-repro | invalid_treatment | failed | passed | $0.0036 |

## Scope and limitations

- Real upstream production files and old regression fixtures are preserved; the existing scoped runner places the repository under src/.
- Regression execution adapts six upstream fixture groups to Node test; it is not the complete upstream TAP suite, CLI suite, or lint gate.
- Hidden acceptance combines upstream bug examples with additional contract cases; fixed references pass and baseline fails before model trials.
- All repairs may converge on one file despite cross-module investigation; this is larger than the original fixtures but not a long-horizon application task.
- Two repetitions across three issues cannot establish statistical superiority. No controller training or general accuracy advantage is claimed.
- Fresh review is additional compute, not a budget-matched baseline. Compare total cost and latency as well as acceptance.
- Raw local transcripts and credentials stay in ignored storage. Sources, schedule, input hashes and failure evidence are retained.
