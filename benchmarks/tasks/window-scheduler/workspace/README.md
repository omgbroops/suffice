# Adjacent windows must not double book

This is an AI-authored synthetic coding benchmark, not a real-world issue.

Repair availability calculation and scheduling. Times are integer minutes. Windows and bookings are half-open intervals [start, end). A booking ending at a proposed start, or starting at its end, does not overlap. Enumerate starts from window.start in stepMinutes increments, including a start whose meeting ends exactly at window.end. Reject starts outside a window and any overlapping booking. Deduplicate and sort starts across overlapping windows. findEarliest returns the first candidate at or after notBefore, or null. duration and stepMinutes are positive.

Fix the implementation under src/. Preserve its public API and work across the complete contract. The visible tests are smoke checks rather than the full acceptance suite.

Run visible checks with:

```sh
node --test tests/visible.test.mjs
```

Use only built-in Node.js APIs; no dependencies or network access are needed.
