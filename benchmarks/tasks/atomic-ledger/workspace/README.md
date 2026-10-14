# Ledger batches publish atomically

This is an AI-authored synthetic coding benchmark, not a real-world issue.

Repair transfer batches. A batch is a sequence of {from, to, amount, id}. Account ids are strings, amounts are positive integer cents, both accounts must exist, and debit balance cannot become negative. Transfers in one batch are evaluated in order against staged balances. A self-transfer validates but leaves its balance unchanged. Committed transfer ids are idempotent: an identical replay is skipped; reusing an id with a different payload rejects. Repeating an identical transfer within the same batch applies once. Any failed transfer leaves both balances and committed ids exactly as before the batch. Return a fresh balance object after success.

Fix the implementation under src/. Preserve its public API and work across the complete contract. The visible tests are smoke checks rather than the full acceptance suite.

Run visible checks with:

```sh
node --test tests/visible.test.mjs
```

Use only built-in Node.js APIs; no dependencies or network access are needed.
