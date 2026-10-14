# Aliases share one dependency identity

This is an AI-authored synthetic coding benchmark, not a real-world issue.

Repair build ordering across alias names. resolveName follows aliases transitively to a real node, detects alias cycles, and rejects names with no real target. Real node dependencies may use aliases. buildOrder returns each reachable real node exactly once, after its dependencies, preserving declared dependency traversal order. Roots may use aliases and duplicate identities. Detect dependency cycles even when a cycle edge uses an alias. Resolve only reachable nodes; unrelated broken nodes do not block a build.

Fix the implementation under src/. Preserve its public API and work across the complete contract. The visible tests are smoke checks rather than the full acceptance suite.

Run visible checks with:

```sh
node --test tests/visible.test.mjs
```

Use only built-in Node.js APIs; no dependencies or network access are needed.
