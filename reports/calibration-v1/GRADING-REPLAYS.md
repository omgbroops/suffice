# HTML grading-only replays

The user authorized one fresh official grading replay of each original ungraded
`filter-js-from-html` artifact: `v2-alone`, `v2-upfront`, and `v2-selective`.
These replays do not invoke a model or repair code. Original trial results,
inference costs, and campaign scores remain unchanged. Report replay verdicts
separately; do not count the original model cost twice.

`benchmark/calibration-regrade.py` reconstructs `/app/filter.py` from recorded
successful tool mutations, excluding failed edits. It also interprets the upfront
actor's final two literal string replacements without executing actor shell code.
The selective artifact exactly matches its recorded final full-file readback.
All three reconstructed sources compile as Python. There is no independently
captured original filesystem hash for the other two; these are receipt-based
reconstructions, not original filesystem snapshots.

Provenance records include event-file hashes, original worker/result hashes,
successful and failed mutation identities, reviewed shell commands, and final
source hashes. Frozen replay inputs are in `grading-replays/html-r1/` beside this
document. Runtime status and trial results live under
`/home/eric_qin/suffice-calibration-v1/grading-replays/html-r1/`.

The runner waits for the outstanding provider replacement campaign to drain,
then runs the three official graders sequentially in clean original task
environments. Task CPU/memory and verification timeout settings are inherited
unchanged. No authentication or model runtime is mounted. Restored source hashes
are checked inside each container before grading. Private test cases/solutions
are not inspected or used to revise the artifacts. A repeated timeout remains
ungraded; this runner does not retry until a pass.

Replays change container contention and reset the grading environment; report
their grading latency separately from the original end-to-end attempt latency.
