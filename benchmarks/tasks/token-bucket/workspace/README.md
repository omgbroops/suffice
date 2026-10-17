# Token bucket must cap, refill, take and wait consistently

This is an AI-authored synthetic coding benchmark, not a real-world issue.

Repair `TokenBucket(capacity, refillPerSec, now = () => Date.now())` in src/bucket.mjs. The clock is injected as `now()` in milliseconds; never read the real clock elsewhere.

Contract:

- A new bucket starts full with `capacity` tokens.
- Tokens refill continuously at `refillPerSec` tokens per second, measured from the last refill, and never exceed `capacity`.
- `tryTake(n)` returns `true` and removes `n` tokens only when at least `n` tokens are available. Otherwise it returns `false` and leaves the token count unchanged.
- `waitTime(n)` returns the whole number of milliseconds, rounded up, until `n` tokens would be available (0 if already available). Refill is per second, so convert to milliseconds.

Fix the implementation under src/. Preserve the public API. The visible tests are smoke checks rather than the full acceptance suite.

Run visible checks with:

```sh
node --test tests/visible.test.mjs
```

Use only built-in Node.js APIs; no dependencies or network access are needed.
