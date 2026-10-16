`onSizeLessThan()` can resolve much later than it should. It only re-checks its condition on task *completions*, so when the queue drains below the limit without a task finishing, the returned promise stays pending until the next unrelated completion.

```js
import PQueue from 'p-queue';

const queue = new PQueue({concurrency: 3, autoStart: false});
for (let i = 0; i < 5; i++) {
  queue.add(() => new Promise(resolve => setTimeout(resolve, 500)));
}
// size is 5, all queued (autoStart is false)

const start = Date.now();
queue.onSizeLessThan(3).then(() => console.log(`resolved after ${Date.now() - start}ms`));

queue.start(); // concurrency 3 dequeues 3 tasks immediately → size drops to 2 (already < 3)
// expected: resolves right away (~0ms, size is 2 the instant start() runs)
// actual:   resolves ~500ms later, when the first task completes
```

Raising `concurrency` at runtime on a running queue shows the same shape: several tasks are dequeued synchronously and `size` falls below the limit, but `onSizeLessThan` doesn't settle until a task later completes. The everyday completion-driven case (a running queue whose size falls as tasks finish) resolves promptly, so the gap is specific to non-completion drains: `autoStart: false` + `start()`, a runtime `concurrency` increase, and interval ticks under rate limiting.

Mechanism: `onSizeLessThan` waits on the `'next'` event, and `'next'` is emitted on task completion (`#next()`), on a queued-task abort, and in `clear()`. The bulk-dequeue in `#tryToStartAnother()` emits `'active'` / `'empty'` / `'idle'` but not `'next'`, so any size decrease that isn't a completion never wakes the waiter.

The queued-abort handler already emits `'next'` right after it removes an item from the queue — so the intended contract looks like "emit `'next'` whenever the waiting set shrinks," and the dequeue path just doesn't follow it. Emitting `'next'` after a successful `dequeue()` in `#tryToStartAnother()` (guarding against a double-emit on the completion path, which also calls it) would line the two up. Happy to send a PR if that direction sounds right.
