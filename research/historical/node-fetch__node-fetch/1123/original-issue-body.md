When using node-fetch to retrieve data from an internal API, `consumeBody` breaks on short responses (Content-Length < 1000) and this error is thrown:

```
FetchError: Could not create Buffer from response body for [ REDACTED ]: The "list[0]" argument must be one of type Array, Buffer, or Uint8Array. Received type string
      at PassThrough.<anonymous> (/opt/ws/webapps/apiv3/node_modules/node-fetch/lib/index.js:432:12)
      at PassThrough.emit (events.js:198:13)
      at endReadableNT (_stream_readable.js:1143:12)
      at process._tickCallback (internal/process/next_tick.js:63:19)
2021-03-19 15:35 -07:00: 
  InternalServerError: Internal Server Error
      at Object.throw (/opt/ws/webapps/apiv3/node_modules/koa/lib/context.js:97:11)
      at Middleware (/opt/ws/webapps/apiv3/middleware/catch_all_errors.js:30:12)
      at process._tickCallback (internal/process/next_tick.js:68:7)
```

**Reproduction**

The only place we've seen the error is in retrieving data from an internal server running Express, so we can't share the URL or credentials needed to access it.

Here are the headers for two responses, one that succeeds and one that fails:

Header | Value for successful query | Value for unsuccessful query
------------ | -------------
Server | nginx/1.14.0 (Ubuntu) | nginx/1.14.0 (Ubuntu)
Date | Fri, 19 Mar 2021 22:38:07 GMT | Fri, 19 Mar 2021 22:42:43 GMT
Content-Type | application/json; charset=utf-8 | application/json; charset=utf-8
Content-Length | 1772 | 895
Connection | keep-alive | keep-alive
X-Powered-By | Express | Express
ETag | W/"6ec-T42wldLuYk3KBSQYxR6B94eUG64" | W/"37f-eWKswgXApEsLQawERLrsbeEguSE"

In the backend, when issuing the unsuccessful query, the initial fetch succeeds, but calling any method that uses `consumeBody` breaks. `Buffer.concat()` is applied to the accumulator, which contains a string, and we get the error from the top of this report.

**Expected behavior**

The expected behavior is for `body.json` to return parsed JSON, or `body.text`, or any of the other methods that consume the body. Instead, `node-fetch` throws an error.

**Your Environment**

| software         | version
| ---------------- | -------
| node-fetch       | 2.6.1
| node             | 10.17.0
| npm              | 6.11.3
| Operating System | Ubuntu 18.04.3 LTS

**Additional context**

I was able to get things working by directly editing `node-fetch/lib/index.js` in the `body.on('data')` callback. When it pushes a chunk into `accum`, I called `Buffer.from` on the chunk if it was a string. This solved the problem. I don't know if this might cause unexpected problems elsewhere.