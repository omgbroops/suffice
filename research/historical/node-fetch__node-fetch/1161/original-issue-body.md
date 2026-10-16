When calling `.clone()` on a `Response` instance, the `highWaterMark` is persisted in the cloned body, but not in the cloned `Request` itself.  This means that cloning the clone results in a lost `highWaterMark`.

**Reproduction**

Steps to reproduce the behavior:

```js
const res = await fetch('https://httpbin.org/bytes/200', {
  highWaterMark: 1024 * 1024
})

console.log(res.highWaterMark) // Is set correctly

const cloneOne = res.clone()

console.log(cloneOne.highWaterMark) // Is undefined

const cloneTwo = cloneOne.clone()

console.log(cloneTwo.highWaterMark) // Is undefined
```

**Expected behavior**

```js
const res = await fetch('https://httpbin.org/bytes/200', {
  highWaterMark: 1024 * 1024
})

console.log(res.highWaterMark) // Is set correctly

const cloneOne = res.clone()

console.log(cloneOne.highWaterMark) // Is set correctly

const cloneTwo = cloneOne.clone()

console.log(cloneTwo.highWaterMark) // Is set correctly
```

| software         | version
| ---------------- | -------
| node-fetch | 3.0.0-beta.9
| node             | 14.16.1
| npm              | 6.14.12
| Operating System | Ubuntu 20.04.2 LTS
