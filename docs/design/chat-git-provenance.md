# Chat Git provenance

Live repository metadata belongs to project groups, not individual chats. A per-chat receipt stores the initial branch/worktree when a new agent session starts. Legacy sessions without a receipt remain unknown; current checkout is never used to backfill them.

Native tool observation receives success/error results, including nested codemode calls. Only successful direct `gh pr create` calls with a returned GitHub pull URL attribute a PR. Successful direct `git switch`/`git checkout` calls refresh that chat's branch. Complex scripts are deliberately not inferred. Receipts are atomically stored beside existing chat change receipts. They do not mutate Git or credentials. Repository-wide project totals remain unchanged.

Validation covers independent chats sharing a directory, external checkout, failed and unrelated commands, and legacy data. Recorded PR status/checks are unknown rather than borrowed from the current branch.
