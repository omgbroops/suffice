# Cache identity and time must agree

This is an AI-authored synthetic coding benchmark, not a real-world issue.

Repair the tenant cache and expiring store. (tenant, resourceId) is an ordered pair of arbitrary strings; separators in either string must not collide. Store TTL uses the injected now function, in milliseconds, both when writing and reading. A value expires exactly at deadline. Cache getOrLoad only reuses live values, supports falsy cached values, and stores a newly loaded value for ttlMs. Different tenants remain isolated.

Fix the implementation under src/. Preserve its public API and work across the complete contract. The visible tests are smoke checks rather than the full acceptance suite.

Run visible checks with:

```sh
node --test tests/visible.test.mjs
```

Use only built-in Node.js APIs; no dependencies or network access are needed.
