With npm `p-queue@9.3.4` / Node 24.14.1, cancellation is missed if the task aborts its signal synchronously before returning a pending operation:

```js
import PQueue from 'p-queue';
import {setImmediate} from 'node:timers/promises';

const queue = new PQueue({concurrency: 1});
const controller = new AbortController();
let release;
const gate = new Promise(resolve => { release = resolve; });
let outcome = 'pending';
let nextStarted = false;
const task = queue.add(() => {
  controller.abort(new Error('cancelled'));
  return gate;
}, {signal: controller.signal});
const handled = task.then(() => { outcome = 'fulfilled'; }, () => { outcome = 'rejected'; });
const next = queue.add(() => { nextStarted = true; });
await setImmediate();
console.log({outcome, nextStarted, pending: queue.pending});
release();
await Promise.all([handled, next]);
```

Actual before releasing the operation: `{outcome: 'pending', nextStarted: false, pending: 1}`. Expected: the `.add()` promise rejects and releases its slot, as it does if the same abort is scheduled in a microtask. This does not require stopping the operation itself; the example releases it explicitly.

The running abort listener is installed after calling the task. `AbortSignal` does not replay the earlier event. Checking `signal.aborted` after registration fixes this without changing the existing promise race or task-error precedence.

Tested patch: [commit c9f9c7d](https://github.com/adenzhou1350/p-queue/commit/c9f9c7d6e671b7c6481acabd2c11d7b06ce01b1a). The regression fails on unchanged source. All 208 Windows runtime tests, `tsc` and `tsd` pass. A paired compiled-JS probe on Windows/Node24.14.1 and Linux/Node24.19.0 covers synchronous callback abort, async-prefix abort and thenable-conversion abort; five normal/abort/error controls remain unchanged. Full Linux/Node20 CI is not verified. Lint currently reports the same nine project-service parsing errors on both unchanged and patched source, so I am not claiming `npm test` passes.

PR creation remains collaborators-only, so this is an issue with a tested patch. AI-assisted analysis and implementation; the reported checks were executed.
