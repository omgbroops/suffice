# TTL cache must expire, refresh and sweep consistently

This is an AI-authored synthetic coding benchmark, not a real-world issue.

Repair `TtlCache(ttlMs, now = () => Date.now())` in src/ttl.mjs. The clock is injected as `now()`; never read the real clock elsewhere.

Contract:

- An entry stored at time `s` is live while `now() - s < ttlMs` and expired once `now() - s >= ttlMs`. `get(key)` returns `undefined` for missing or expired entries.
- `set(key, value)` on an existing key replaces the value and restarts its lifetime from the current time.
- `size()` counts only live entries. Expired entries that have not been swept are not counted.
- `sweep()` removes every expired entry, including when several adjacent entries expire together, and returns the number removed. Live entries are kept.

Fix the implementation under src/. Preserve the public API. The visible tests are smoke checks rather than the full acceptance suite.

Run visible checks with:

```sh
node --test tests/visible.test.mjs
```

Use only built-in Node.js APIs; no dependencies or network access are needed.
