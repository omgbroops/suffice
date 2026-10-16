<!--- Provide a clear and concise description of what the bug is. -->

**Reproduction**

Steps to reproduce the behavior:

```js
import fetch from 'node-fetch';

fetch('URL which returns 302 code')
    .then((response) => response.text())
    .then(console.log)
    .catch(console.error);
```
```
file:///C:/Git/monitoring_bot/node_modules/node-fetch/src/index.js:113
                        response.body.destroy(error);
                                 ^

TypeError: Cannot read properties of null (reading 'body')
    at file:///C:/Git/monitoring_bot/node_modules/node-fetch/src/index.js:113:13
    at TLSSocket.onSocketClose (file:///C:/Git/monitoring_bot/node_modules/node-fetch/src/index.js:386:5)
    at TLSSocket.emit (node:events:539:35)
    at node:net:715:12
    at TCP.done (node:_tls_wrap:582:7)

Node.js v17.9.0
```

**Expected behavior**

Don't throw error, follow redirect and print response.text()


**Your Environment**

<!--- Include as many relevant details about the environment you experienced the bug in -->

| software         | version
| ---------------- | -------
| node-fetch       | 3.2.5
| node             | 17.9.0
| npm              | 8.5.0
| Operating System | windows and linux

**Additional context**

Problem exists after update to 3.2.5, on 3.2.4 example code doesn't throw error

<!--- Add any other context about the problem here. -->
