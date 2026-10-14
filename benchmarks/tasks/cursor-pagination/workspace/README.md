# Filtered pages still advance

This is an AI-authored synthetic coding benchmark, not a real-world issue.

Repair the repository and collector. Rows have unique increasing integer ids and may be deleted. A cursor is exclusive. limit counts raw rows scanned, before deleted rows are filtered. nextCursor is the last scanned id when further raw rows remain, otherwise null. collectAll must follow nextCursor even for a short or empty filtered page, yielding every live row once in source order. A repeated cursor or maxPages exhaustion should fail instead of looping forever.

Fix the implementation under src/. Preserve its public API and work across the complete contract. The visible tests are smoke checks rather than the full acceptance suite.

Run visible checks with:

```sh
node --test tests/visible.test.mjs
```

Use only built-in Node.js APIs; no dependencies or network access are needed.
