---

## What’s wrong

`emitter.emitSerial()` used to enqueue listeners correctly, but it **never
notified the internal producer queue** that powers `events()` and
`anyEvent()`. As a result, an iterator created with one of those methods
receives nothing when events are emitted serially. The loop just hangs
indefinitely, even though `listenerCount()` shows something is subscribed.

This contradicts the documentation and breaks any code that mixes serial
emission with iterator consumption (a common pattern in Node.js).

## How to reproduce

```js
// poc-emitSerial.mjs
import Emittery from './index.js';

(async () => {
	const e = new Emittery();
	const it = e.events('x');
	e.emitSerial('x', 1);
	e.emitSerial('x', 2);

	for await (const v of it) {
		console.log('got', v);
		if (v === 2) break;
	}
	console.log('done');
})();
```

**Before fix:** nothing is printed; the loop never advances.
**After fix:**
```
got 1
got 2
done
```

The same issue affects `anyEvent()`.

## Root cause

The bodies of `emit()` and `emitSerial()` are almost identical; the only
difference was that the latter skipped this line:

```js
enqueueProducers(this, eventName, eventData);
```

Without it, producers never see serial emissions.

## Fix applied locally

* Added the missing call in `emitSerial()`.
* Added two tests verifying iterators get values from `emitSerial()`.
* Updated README to note both emit methods behave the same for iterators.

Tests now run cleanly (89 passing); the bug is resolved.

 

---
 