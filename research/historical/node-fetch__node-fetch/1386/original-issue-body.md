<!--- Provide a clear and concise description of what the bug is. -->

**Reproduction**

Steps to reproduce the behavior:

1. Request to a valid URL to which the server responds with an invalid Location header
2. Server crashes despite `await fetch()` being wrapped in `try { } / catch () { }`

```
Uncaught TypeError [ERR_INVALID_URL]: Invalid URL: //super:invalid:url%/
      at onParseError (internal/url.js:279:9)
      at new URL (internal/url.js:355:5)
      at ClientRequest.<anonymous> (file:///home/tasinet/code/node-fetch/src/index.js:133:52)
      at HTTPParser.parserOnIncomingClient [as onIncoming] (_http_client.js:647:27)
      at HTTPParser.parserOnHeadersComplete (_http_common.js:126:17)
      at Socket.socketOnData (_http_client.js:515:22)
      at addChunk (internal/streams/readable.js:290:12)
      at readableAddChunk (internal/streams/readable.js:265:9)
      at Socket.Readable.push (internal/streams/readable.js:204:10)
      at TCP.onStreamRead (internal/stream_base_commons.js:188:23)
```

An example URL with this behaviour is `http://vardakeio.gr`:
```
curl -v http://vardakeio.gr 2>&1 | grep Location
< Location: https://vardakeio.gr%/
```

**Expected behavior**

Invalid URL should be caught and an appropriate error returned

**Your Environment**

<!--- Include as many relevant details about the environment you experienced the bug in -->

| software         | version
| ---------------- | -------
| node-fetch       | 3.1.0
| node             | 14.17.6
| npm              | 6.14.15
| Operating System | Ubuntu 20.04.2 LTS

**Additional context**

This is because the location header is passed to `new URL()` without a try/catch block around it:

index.js:133
```
// HTTP fetch step 5.3
const locationURL = location === null ? null : new URL(location, request.url);
```

Raising a PR to address this.