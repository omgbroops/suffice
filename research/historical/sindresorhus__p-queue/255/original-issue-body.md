With p-queue 9.3.3 and Node 24.14.1, adding a task from an `active` listener can start two task bodies despite `concurrency: 1`.

```js
import PQueue from 'p-queue';

const queue = new PQueue({concurrency: 1});
let release;
const gate = new Promise(resolve => { release = resolve; });
let running = 0;
let peak = 0;
const work = async () => {
  running++;
  peak = Math.max(peak, running);
  await gate;
  running--;
};
let nested;
queue.once('active', () => { nested = queue.add(work); });
const first = queue.add(work);
console.log(JSON.stringify({peak, pending: queue.pending, concurrency: queue.concurrency}));
release();
await Promise.all([first, nested]);
await queue.onIdle();
```

Expected: `peak` and `pending` stay at 1. Actual: `{"peak":2,"pending":2,"concurrency":1}`. Both tasks are held on the same gate, so this is simultaneous execution, not just an event count.

`active` is emitted before the current task increments `pending`; the listener can reenter scheduling while capacity still looks available. Moving the emission inside the existing task `try` block, after capacity is reserved, fixes this and preserves cleanup when a listener throws.

Tested fix: [commit 0a2f4c3](https://github.com/adenzhou1350/p-queue/commit/0a2f4c30ab78a2e110bedb93c6e914acc2d1f7d5). Its three regressions and all 209 runtime tests pass on Windows; the compiled-JS public-API regression and ordinary-queue control also pass on Linux/Node 24.19.0. Full Linux test/lint CI is not verified.

PR creation is collaborators-only, so I am reporting the reproduction here. AI-assisted analysis and implementation; the reported tests were executed.
