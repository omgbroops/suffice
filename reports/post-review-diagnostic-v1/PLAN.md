# Authorized ten-attempt diagnostic

Five tasks from the original thirty-task/four-arm comparison, two fresh attempts
per task: Luna High alone and Luna High followed by bounded Sol Low review and
at most one Luna repair. Historical Pi/Sol results are reference only; its old
budgets and settings differ. No new Pi calls are authorized for this campaign.

| Task | Original Pi | Original V2 | Selection purpose |
| --- | --- | --- | --- |
| query-optimize | Pass | Fail | SQL correctness/performance |
| gcode-to-text | Pass | Fail | Interpretation of an existing artifact |
| path-tracing | Pass | Fail | C implementation and image reconstruction |
| regex-log | Pass | Pass | Shared-success control |
| configure-git-webserver | Fail | Fail | Shared-failure and system-scope challenge |

Selection was frozen before new inference, using published acceptance metadata
only. These are previously analyzed tasks, not held-out evidence. Selection
deliberately emphasizes old V2 failures and is not representative of overall
task success. Preserve all original runs, scores, patches, and costs unchanged.

The finite queue waits for the JS/TS pilot and both user-authorized timeout
replacements to complete. A preceding operational/quota stop blocks this queue
for review. There are ten attempts only, no automatic outcome retries. Two
containers run concurrently, including grading/cleanup. Every arm has a shared
$1 API-equivalent allowance, 100 responses, 240 tool calls, and 1,800-second
agent phase. Sol review remains bounded to $0.03/60 seconds within that allowance.
Response-boundary overshoots are charged. The campaign stops new admissions at
$10 known spend, weekly usage remaining at or below 40%, or incomplete accounting
or operational failures. No quota resets are redeemed.

Both arms reuse the exact frozen JS/TS pilot harness runtime. No product code,
models, prompts, routing, or review policy changes are part of this diagnostic.
Separate state/trials/results live under
`/home/eric_qin/suffice-post-review-diagnostic-v1`. The runner first prepares
fresh images and validates an install-only Harbor trial without inference.

The patch reviewer requires a clean Git root. Both arms receive identical
derived initial images with a clean Git snapshot of `/app`; existing Git roots
cause preparation to fail rather than being overwritten. The original task
instructions remain unchanged. Generated PPM/SQLite files, the compiled `image`
executable, and Python bytecode are excluded from the review snapshot. This is
an explicit benchmark adaptation, so these are not exact repetitions of the old
environment. The original image IDs, instruction hashes, task configuration
hashes, runtime hashes, and rotated arm order are recorded before inference.

Public smoke checks are authored only from the original public task instructions
and are shown equally to both arms. SQL checks validate syntax/plan, not full
equivalence or speed. G-code checks validate output existence, not its answer.
Image checks compile/run and check source size/output existence, not similarity.
Regex checks use a small public example, not the private evaluation cases. The
Git server check exercises the requested local push-to-HTTP flow and may add a
public probe file to deployed content. These coverage limits are printed in the
public evidence. Failing initial smoke checks do not receive paid preflight
repairs. Public verification remains partial.

The original private verifier is used only by Harbor after the actor stops.
Its test directory is referenced without reading its contents during selection,
preparation, or review. No previous patch, diagnosis, answer, private test, or
grader feedback is mounted into actor context. In particular, Sol does not see
the reference image pixels or installed service state: its packet contains the
original task, supported Git diff/new text files, and public verification evidence.
The Git-server task can expose this prototype's limits even when public checks
pass. Do not broaden the reviewer mid-campaign to accommodate failures.

Report acceptance, policy-valid completion, cost per accepted task, latency,
usage/cache tokens, review decisions and repairs. Keep unknown bills as floors.
Use these runs to diagnose whether review catches recurring mistakes; any
subsequent general-quality claim needs fresh held-out tasks.
