# Async LRU cache must track recency, share loads and tolerate failures

This is an AI-authored synthetic coding benchmark, not a real-world issue.

Repair `LruCache(capacity)` in src/lru.mjs. `getOrLoad(key, loader)` returns a cached value or runs `loader` once and caches its result. Falsy values (0, '', null, false) are cached like any other value.

Contract:

- A hit refreshes recency. Eviction removes the least recently used settled entry when settled entries exceed capacity.
- Concurrent `getOrLoad` calls for the same key share one in-flight loader call and receive the same value.
- A rejected loader is not cached, rejects every caller that shared that load, and leaves no in-flight state, so a later call loads again.
- In-flight loads do not count toward capacity and are not evicted. Only settled entries count.

Fix the implementation under src/. Preserve the public API. The visible tests are smoke checks rather than the full acceptance suite.

Run visible checks with:

```sh
node --test tests/visible.test.mjs
```

Use only built-in Node.js APIs; no dependencies or network access are needed.
