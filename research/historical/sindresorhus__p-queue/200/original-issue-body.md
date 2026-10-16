`p-limit` doesn't correctly propagate the `AsyncResource` execution context into the callbacks. See the demo code below for an example:

```js
import pLimit from 'p-limit';
import { AsyncLocalStorage } from 'async_hooks';

const limiter = pLimit(2);
const store = new AsyncLocalStorage();

async function checkId(id) {
    const storeId = store.getStore()?.id;
    const match = id === storeId ? 'match' : 'mismatch';
    console.log(`arg id: ${id}, store id: ${storeId}, ${match}`);
}

async function startContext(id) {
    return store.run({ id }, () => limiter(checkId, id));
}

(async () => {
    await Promise.all(Array(100)
        .fill(0)
        .map((_value, idx) => idx)
        .map(id => startContext(id)));
})();
```

The output looks like:
```
arg id: 0, store id: 0, match
arg id: 1, store id: 1, match
arg id: 2, store id: 0, mismatch
arg id: 3, store id: 1, mismatch
arg id: 4, store id: 0, mismatch
arg id: 5, store id: 1, mismatch
arg id: 6, store id: 0, mismatch
arg id: 7, store id: 1, mismatch
arg id: 8, store id: 0, mismatch
arg id: 9, store id: 1, mismatch
arg id: 10, store id: 0, mismatch
arg id: 11, store id: 1, mismatch
arg id: 12, store id: 0, mismatch
arg id: 13, store id: 1, mismatch
arg id: 14, store id: 0, mismatch
arg id: 15, store id: 1, mismatch
arg id: 16, store id: 0, mismatch
arg id: 17, store id: 1, mismatch
arg id: 18, store id: 0, mismatch
arg id: 19, store id: 1, mismatch
```

i.e. it seems like `p-limit` is basically wrongly propagating the async context of the first two callbacks into all subsequent callbacks.

To overcome this, I think callbacks need to be wrapped with `AsyncResource.bind` when they are scheduled to preserve the execution context of the caller.