`listenKeys` stopped firing for `deepMap` consumers watching dot-path keys after #406's fix, since the new whole-store-set comparison reads keys as plain bracket properties, which don't exist on a `deepMap`'s nested value shape.

The current implementation:

```js
export function listenKeys($store, keys, listener) {
  let keysSet = new Set(keys)
  return $store.listen((value, oldValue, changed) => {
    if (
      changed === undefined
        ? keys.some(key => value[key] !== oldValue[key])
        : keysSet.has(changed)
    ) {
      listener(value, oldValue, changed)
    }
  })
}
```

`listenKeys`'s own type signature is generic over any store with `setKey(key, value)`, which explicitly includes `deepMap` (dot-path keys like `'profile.name'`), not just `map` (flat keys). But `value[key]` for a dot-path key does a literal bracket lookup, `value['profile.name']` is `undefined` on an object shaped `{ profile: { name: ... } }`, there's no top-level property with that exact name. So for a `deepMap`, `value[key] !== oldValue[key]` is `undefined !== undefined`, always `false`, for every watched key, on every whole-store `.set()` call.

Reproduced against the real published package (`nanostores@1.4.2`), not just by reading the source:

```js
import { deepMap, listenKeys } from 'nanostores'

const $store = deepMap({ profile: { name: 'old' }, other: 1 })
let events = []
listenKeys($store, ['profile.name'], (value, oldValue, changed) => {
  events.push({ changed, name: value.profile.name })
})

$store.set({ profile: { name: 'new' }, other: 1 })
console.log(events) // []  — expected the listener to fire, profile.name did change
```

`setKey('profile.name', 'new')` (the non-whole-store path) still works fine, since `changed` is the literal string `'profile.name'` there and `keysSet.has(changed)` does a correct set-membership check. It's specifically the whole-store `.set()` path from #406 that regressed for deep keys.

`deepMap` itself is deprecated in favor of `@nanostores/deepmap` and slated for removal in 2.0, but it's still shipped and functional today, so this is a live regression for anyone combining `listenKeys` with `deepMap` and a whole-store `.set()` call, worth checking whether `@nanostores/deepmap`'s own key format needs the same `getPath`-aware comparison if it reuses this same `listenKeys`.
