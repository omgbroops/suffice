# Batcher must flush, fail and drain items consistently

This is an AI-authored synthetic coding benchmark, not a real-world issue.

Repair `Batcher(flushFn, maxSize, maxWaitMs)` in src/batcher.mjs. `add(item)` returns a promise. `flushFn(items)` is async and returns an array of results, one per item in order. Timers use the global `setTimeout`.

Contract:

- A batch flushes as soon as the number of pending items reaches `maxSize`, or `maxWaitMs` after the first item of a batch was added, whichever comes first.
- Each `add` promise resolves with its item's result from `flushFn`. If `flushFn` rejects, every promise for items in that batch rejects with the same error.
- Items added while a flush is in flight are kept and flushed later. They are never dropped.
- A size-triggered flush cancels the pending timer, so no extra flush fires for items already sent.
- At most one flush runs at a time.

Fix the implementation under src/. Preserve the public API. The visible tests are smoke checks rather than the full acceptance suite.

Run visible checks with:

```sh
node --test tests/visible.test.mjs
```

Use only built-in Node.js APIs; no dependencies or network access are needed.
