When an input iterator throws after yielding an item, `limit.map()` rejects with the iterator error but leaves already scheduled mapper promises unobserved. If a mapper also rejects, Node terminates with an unhandled rejection even though the caller caught the map error.

Reproduced with p-limit 7.3.0, 7.3.2, and main at `783068bb9e967fd7bea8642e1bf5a3627fe38bdf`, using Node 24.13.0 on macOS.

### Reproduction

With p-limit 7.3.2 installed, save this as `repro.mjs` and run `node --unhandled-rejections=strict repro.mjs`:

```js
import pLimit from 'p-limit';

function* inputs() {
  yield 'example';
  throw new Error('Iterator failed');
}

try {
  await pLimit(1).map(inputs(), async () => {
    throw new Error('Mapper failed');
  });
} catch (error) {
  console.log('Caught:', error.message);
}
```

Actual: prints `Caught: Iterator failed`, then exits with code 1 from an unhandled `Mapper failed` rejection. Replacing `inputs()` with `['example']` is a healthy control: the catch receives `Mapper failed` and the process exits cleanly.

Expected: the iterator error rejects the returned promise, while rejections from tasks already scheduled by `map()` are observed. This need not cancel those tasks or delay the iterator error until they finish.

### Cause and proposed fix

`Array.from(iterable, ...)` schedules mapper promises while consuming the iterator. If iteration throws, execution never reaches `Promise.all(promises)`, leaving those promises unobserved. I recognize that the documented equivalent expression currently has this same behavior; this is a proposal to harden that failure path.

A [tested candidate fix](https://github.com/brennanbutler01/p-limit/commit/e442a9887054e32d02386b806b0a59630ebda6d0) records scheduled promises during iteration and observes them with `Promise.allSettled()` in the iteration-error path before immediately rethrowing the original error. It preserves scheduling order, shared-queue behavior, and array-like runtime support. It adds a temporary array of promise references during collection.

Verification: two strict subprocess regressions fail against unchanged main; all 30 tests pass with the fix on Node 22.20.0 and 24.13.0. Full `pnpm test`, including XO and tsd, passes on Node 24 (one existing TODO warning). Controls cover throwing before any item, mapper errors, interleaved scheduling, array-like input, and immediate rejection with pending work. Node 20 and browsers were not tested locally.

I found no exact duplicate in the open and closed reports checked. GitHub denied pull-request creation for my account, so I am sharing the reproduction and candidate commit here.

Prepared with OpenAI Codex assistance.
