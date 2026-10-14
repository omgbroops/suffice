# Retries must preserve a logical request

This is an AI-authored synthetic coding benchmark, not a real-world issue.

Repair the HTTP client and retry policy. A POST without a caller-provided idempotency-key receives one generated key per logical request, reused on every attempt; separate calls receive separate generated keys. Caller headers are preserved, including an explicit idempotency-key. Retry only 429 and 5xx responses, at most maxAttempts total attempts. Numeric Retry-After values are seconds and override exponential backoff. Backoff is baseMs * 2^(attempt - 1), where the first failed attempt is 1. sleep and keyFactory are injected for deterministic use. Return the successful response or final unsuccessful response.

Fix the implementation under src/. Preserve its public API and work across the complete contract. The visible tests are smoke checks rather than the full acceptance suite.

Run visible checks with:

```sh
node --test tests/visible.test.mjs
```

Use only built-in Node.js APIs; no dependencies or network access are needed.
