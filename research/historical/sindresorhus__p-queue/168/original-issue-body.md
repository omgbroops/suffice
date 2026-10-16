If we have one pending and one waiting task and abort them both, then the queue gets stuck with one pending task forever and gets blocked

```js
import PQueue, {AbortError} from 'p-queue';

const queue = new PQueue({concurrency: 1});

const controller1 = new AbortController();
const controller2 = new AbortController();

try {
	const task1 = queue.add(({signal}) => fetch('https://sindresorhus.com', {signal}), {signal: controller1.signal});
	const task2 = queue.add(({signal}) => fetch('https://example.com', {signal}), {signal: controller2.signal});


          setTimeout(() => {
                  controller1.abort();
                  controller2.abort();
          
                  queue; // Size: 1  Pending: 1
          }, 0)

        await task1;
        await task2;
} catch (error) {
	if (!(error instanceof AbortError)) {
		throw error;
	}
}
```