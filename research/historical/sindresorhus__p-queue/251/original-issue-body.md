**Version:** 9.3.2

## Behaviour

When `intervalCap > 1` and tasks are spread across a window (first slot consumed early, last slot consumed later), tasks added *after* the interval window expires are incorrectly held back — even though they belong to a fresh window.

## Reproduction

```js
import PQueue from 'p-queue';
const delay = ms => new Promise(r => setTimeout(r, ms));

const queue = new PQueue({ intervalCap: 2, interval: 1000 });
const t0 = Date.now();

// Window [0, 1000): consume slot 1 at t≈0
queue.add(() => console.log('A at +' + (Date.now()-t0) + 'ms'));

// Consume slot 2 at t≈600
await delay(600);
queue.add(() => console.log('B at +' + (Date.now()-t0) + 'ms'));
await queue.onIdle();

// Now at t≈1100 — past the window boundary. Task C should start immediately.
await delay(500);
const tC = Date.now();
await queue.add(() => console.log('C at +' + (Date.now()-t0) + 'ms'));
console.log('Task C waited', Date.now()-tC, 'ms  (expected ~0, got ~400)');
```

Output:
```
A at +0ms
B at +603ms
C at +1604ms          ← should be ~1100ms
Task C waited 499ms   ← should be ~0ms
```

## Root cause

The fix for #182 introduced a `#lastExecutionTime` guard inside `#isIntervalPausedAt` that, when the interval timer is absent and `intervalEnd` has already passed, checks whether at least `interval` ms have elapsed since the most-recently-dequeued task:

```ts
if (this.#lastExecutionTime > 0) {
    const timeSinceLastExecution = now - this.#lastExecutionTime;
    if (timeSinceLastExecution < this.#interval) {
        this.#createIntervalTimeout(this.#interval - timeSinceLastExecution);
        return true;  // keeps intervalCount unreset, blocks the next task
    }
}
```

For `intervalCap: 1` this correctly enforces spacing — the single task occupies the full window, so "time since last dequeue ≥ interval" is equivalent to "window has expired."

For `intervalCap > 1` the last dequeued slot can be significantly later than the window's start, so `#lastExecutionTime + interval` overshoots the true window boundary. In the repro above:
- Window started at t≈0, so it expires at t=1000.
- Last task was dequeued at t≈600, so `#lastExecutionTime + interval = 1600`.
- Task C arrives at t=1100 (after true window expiry) but `timeSinceLastExecution = 500 < 1000`, so a 500 ms timeout is created and `#intervalCount` is never reset.
- Task C is blocked until t≈1600 even though it is in window [1000, 2000) and both slots are free.

## Expected behaviour

A task added after `intervalEnd` has passed should experience no additional delay regardless of when within the previous window the last slot was consumed. The window boundary (`#intervalEnd`) already captures this correctly; the `#lastExecutionTime` check should not extend it.