`listenerCount` returns total count of all events instead of our given Symbol event.

For example:
```ts
import Emittery from "emittery"

const SYMBOL = Symbol()

let emittery = new Emittery()
emittery.on("hello", () => {})
emittery.on("world", () => {})

console.log("hello event count", emittery.listenerCount("hello"))
// => 1

console.log("symbol event count", emittery.listenerCount(SYMBOL))
// => 2, expected 0
```