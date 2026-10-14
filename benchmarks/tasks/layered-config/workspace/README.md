# Configuration overrides preserve intentional values

This is an AI-authored synthetic coding benchmark, not a real-world issue.

Repair layered configuration. Layers are applied left to right. Plain objects merge recursively; arrays replace rather than append. Explicit false, 0, empty strings, and null override earlier values. undefined means no override. Output must not mutate or share mutable arrays/objects with any input layer, including branches that were never overridden. loadConfig merges defaults, environment, and overrides then validates endpoint as a string and retries as a nonnegative integer. Keep validation and source inputs intact.

Fix the implementation under src/. Preserve its public API and work across the complete contract. The visible tests are smoke checks rather than the full acceptance suite.

Run visible checks with:

```sh
node --test tests/visible.test.mjs
```

Use only built-in Node.js APIs; no dependencies or network access are needed.
