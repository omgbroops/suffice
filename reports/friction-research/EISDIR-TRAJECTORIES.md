# Offline trajectories after newest EISDIR errors

All 25 EISDIR nested-call failures in the original 34 attempts were reconstructed from saved transcripts: 22 `symbols` failures and three `search` failures, affecting 24 attempts. The failed path was a directory (`src` or `src/`). No model/tool programs were executed. The analyzer asserts these cohort counts and writes per-error local references, next-call records and descriptive costs in `EISDIR-TRAJECTORIES.json` without source/transcript text.

| Next recorded behavior | Error cases |
|---|---:|
| Same tool name succeeds in next tool-result batch with a file path | 23 |
| Same tool name succeeds in next tool-result batch with omitted path | 1 |
| Switches to other tools; no later same-name call | 1 |
| Repeats EISDIR in the next batch | 0 |

Every error was followed by another assistant response and a recorded tool-result batch. The same-name comparison is operational, not semantic equivalence: arguments/query intent may change. It does not establish that the model explicitly diagnosed EISDIR in prose. The next assistant's actual executed call behavior provides the correction evidence.

All 25 failed batches had successful calls before the failing call, and all 25 retained nonempty printed partial output. Seventeen used multiple-emission markers; eight printed a single output directly, so markers alone undercount preserved output. Their preserved emitted sections total 26,533 characters, including boundaries where present. No recorded nested call follows the failing call within these batches. This supports batch interruption with already emitted evidence retained; it does not reconstruct unexecuted program statements or prove all completed nested results were printed. Whole failed-result text sizes and emitted-section sizes are separated in JSON.

Examples (all indices zero based):

- `evidence-screen-v1/001-pmap-readahead-A-r0/worker/transcript.json`, message 3: the initial directory `symbols` failure follows successful `files` and README `file_read`; the next batch succeeds with `symbols` targeting `src/index.js`. Existing printed discovery/task context remains available.
- `live-scored-v1/03-marked-4123-semantic-r0/execution/transcript.json`, message 5, nested 1: `search` fails on a directory after a completed reference lookup. The next batch's `search` omits the path and succeeds, followed by file-scoped navigation/read calls.
- `live-scored-v1/04-marked-4123-navigation-r0/execution/transcript.json`, message 7, nested 3: `search` fails after two `symbol_read` calls and `symbol_references`. The next batch edits `src/Tokenizer.ts` twice and runs a successful visible test, with no subsequent `search`. This attempt also had an earlier EISDIR, explaining 25 failures across 24 attempts; it is not a repeated immediate retry of the same failing search.

Next assistant responses have $0.0706168 of known recorded cost across error cases. All subsequent saved assistant responses after each attempt's first EISDIR total $1.0195036 when counted once by transcript/message reference. Summing the per-error subsequent totals instead yields $1.0271084 because two error windows overlap in one attempt. No subsequent response lacks a finite recorded cost in these windows. These are descriptive historical costs, **not avoidable cost**, provider invoices, or an estimate of savings from a path-handling change. The response combines useful work with correction, and successful continuations would still have cost without the error.

Run `node scripts/analyze-eisdir-trajectories.mjs` from this worktree. The prior printing analyzer already verified all 34 transcript hashes against the supplied manifest. This supplement reads the same saved transcripts; it makes no live reliability claim and does not alter old campaigns, runtime code, authentication or dependencies. Its references and per-case records support audit without publishing private trace content.
