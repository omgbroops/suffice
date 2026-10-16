In `nanostores/atom`, there is a global variable called `epoch` that is used in `nanostores/computed` to determine whether state changes should be computed.

However, if two dependent modules both use nanostores for reactive state, they could each end up with their own instance of the `epoch` variable. This can break application logic, as the state change detection relies on the shared value of `epoch`.

**Expected behavior:**  
There should be a single, consistent instance of `epoch` across all modules using nanostores, to ensure correct computation of state changes.

**Actual behavior:**  
Multiple instances of `epoch` may be created if nanostores is bundled separately in different parts of an application, leading to inconsistent state updates.


To fix this, maybe store `epoch` on `globalThis` using a symbol, like:

```js
const EPOCH_SYMBOL = Symbol.for("nanostores.epoch")
globalThis[EPOCH_SYMBOL] = globalThis[EPOCH_SYMBOL] || 0
```

### Extra context
In our setup, we've got a monorepo with multiple libraries—a core (vanilla JS) version and a React version. The React version uses `computed`, but the core version doesn't.

Because our bundler has tree shaking enabled, `epoch` was getting removed from the core bundle since nothing in core actually reads its value. The React version uses `computed` to subscribe to multiple stores from core and compute values from them.

Here's where things break: since the core and React versions are bundled separately, only the React bundle has the `epoch` logic. The stores themselves come from core (which is missing `epoch`), so the `computed` in React doesn't get updates from those stores. React ends up with its own `epoch` instance, which isn't being updated by changes in core, causing computed values to never update.
