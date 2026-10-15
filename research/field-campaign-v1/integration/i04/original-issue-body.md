I've found some scenarios where the specified concurrency won't be respected.

1. When a queue with active workers is paused and resumed it starts `concurrency` more workers, regardless of how many are already running: https://github.com/mcollina/fastq/blob/b8d99205b36f9a0e8063ab9c84f6a92757d59ced/queue.js#L80-L83 E.g. the following will have multiple workers running in parallel, even though the concurrency is set to just `1`:
    ```js
    const queue = require('fastq')((i, cb) => {
      console.log({worker: i, running: queue.running()});
      setTimeout(cb, 1000)
    }, 1);

    for (let i = 0; i < 20; i++ ) {
      queue.push(i);
    }

    queue.pause();
    queue.resume();
    ```
    Every subsequent call to `queue.pause(); queue.resume();` will cause one more worker to start running in parallel.

2. Changes to the concurrency are supported according to https://github.com/mcollina/fastq/blob/b8d99205b36f9a0e8063ab9c84f6a92757d59ced/README.md?plain=1#L234C6-L235. However, doing so while the queue has active workers has no effect either way:
    ```js
    const queue = require('fastq')((i, cb) => {
      console.log({worker: i, running: queue.running()});
      setTimeout(cb, 1000)
    }, 1);

    for (let i = 0; i < 20; i++ ) {
      queue.push(i);
    }

    queue.concurrency = 5;
    ```
    ```js
    const queue = require('fastq')((i, cb) => {
      console.log({worker: i, running: queue.running()});
      setTimeout(cb, 1000)
    }, 5);

    for (let i = 0; i < 20; i++ ) {
      queue.push(i);
    }

    queue.concurrency = 1;
    ```

3. Even worse, changing the concurrency to a number lower than the count of currently running workers can cause all subsequently added tasks to be run in parallel:
    ```js
    const queue = require('fastq')((i, cb) => {
      console.log({worker: i, running: queue.running()});
      setTimeout(cb, 1000)
    }, 2);

    queue.push(0);
    queue.push(1);

    queue.concurrency = (queue.running() - 1);

    for (let i = 2; i < 20; i++ ) {
      queue.push(i);
    }
    ```

4. Changing the concurrency to some non-sensical value like `-1` or `1.2` has the same effect. Setting it initially to a value less than one causes an error to be thrown, but changing it later to that is allowed just fine.

I'd be happy to make a pull request that addresses these scenarios, just wanted to hear your thoughts first.

In order to maintain the current API we could make use of a `getter` and `setter` for the concurrency so that changing it can have the side-effect of running extra workers. Killing currently running workers of course still won't be supported since we can't stop arbitrary running functions in JavaScript.

But if you'd prefer to change the API and have the concurrency changed by a call to `queue.concurrency()` then I'd implement it like that.