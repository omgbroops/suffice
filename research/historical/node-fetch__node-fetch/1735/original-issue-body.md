# Overview

When using `node-fetch` on Node.js 19+ to make two consecutive requests to the same web server, we always get the error: `FetchError: request to <URL> failed, reason: socket hang up`

> TLDR: This issue is caused by https://github.com/nodejs/node/issues/47130 in nodejs, exacerbated by an issue with `node-fetch` blindly sending `Connection: Close` headers. This was fixed via #1736 in `node-fetch` v3.3.2 (note: 3.x is only ESM-enabled). This will hopefully be fixed in `node-fetch` v2 once #1765 is merged and released.

## Details

This error only arises with `node-fetch` and Node.js 19+ (tested using 19.9.0 and 20.0.0), and the web server we were using was Axum. We didn't see this issue when using a node-based proxy to help with debugging - I imagine it depends slightly on the order of TCP packet delivery and latency and the internal state machines of the HTTP servers - but it seems like many HTTP servers would see this issue.

The error appears to only occur where the **second request to the same server in the same round of the event loop as the first request was awaited**, which gives the error:

```
FetchError: request to <URL> failed, reason: socket hang up
```

# Explanation 
## Root cause

We believe the following explains what we're seeing, and is backed up by logs at the end of this post:

* `fetch` sends a `connection: close` header in its first HTTP request...
  * The server responds with a http response, which `fetch` hands back to the caller.
  * The server actions the close connection request by following up the http response with a TCP packet with the `FIN` flag. This marks the end of the connection from the server's point of view. At this point, it does not expect to receive any further requests.
  
* Still in the same event loop, the caller calls fetch again to make its second HTTP request to the same origin.
  * Node.js attempts to send the next request to the host using _the same connection_
  * But the TCP connection is closed at the server's end, so returns a `conn reset` at the TCP layer
  * Resulting in the `socket hang up`

And I believe this may be the cause:

* The first response from the server is handed back to the caller likely in the [poll phase of the event loop round](https://nodejs.org/en/docs/guides/event-loop-timers-and-nexttick#phases-overview)).
* In the mean time, the server has responded to close the TCP connection - but the event loop doesn't get round to handling it (not least because it's not yet in the `close callbacks` phase)
* The caller then attempts to send a new request. But as far as the event loop is concerned, we're still at the `poll` stage, and haven't yet handled the socket close event...
* So I would guess that Node.js internally has yet to close the connection (because it's waiting for the `close callbacks` stage?), so attempts to send the HTTP request on the same (as yet unclosed) connection.
* The server receives this request but has already closed the connection - so responds with connection reset message... which results in `fetch` raising the `socket hang` error.

Basically it's a race condition between the server closing the connection and the client sending the second request... but it happens reproducibly 100% of the time, and is caused by buggy behaviour, possibly in the Node.js agent?

I would imagine that Node.js 19 changed some internal handling of socket closes which delayed the handling of the close when a connection close http request is sent, and introduced - but I'm not sure if it's Node.js or `node-fetch` at fault.

# Actions
## Workarounds

The following both appeared to work - but for what it's worth, I don't think either of these is a "fix" because it's no longer an easy isomorphic drop in for the browser fetch.

* It appears that inserting the line `await new Promise((resolve) => setTimeout(resolve, 0))` before every API call to try to ensure any connections are closed fixes the problem.
* Using a [custom http / https agent](https://github.com/node-fetch/node-fetch#custom-agent) with `keepalive`, eg:
```ts
import http from 'node:http';
import https from 'node:https';

const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });
const agentSelector = function(_parsedURL: any) {
    if (_parsedURL.protocol == 'http:') {
        return httpAgent;
    } else {
        return httpsAgent;
    }
}

// ...

const response = await fetch(url, { agent: agentSelector });
```

## Suggestions for fixes

> TLDR: [These lines are incorrect in node-fetch](https://github.com/node-fetch/node-fetch/blob/bcfb71c7d10da252280d13818daab6925e12c368/src/request.js#L291)

There is arguablably issues in both `node-fetch` and Node.js itself.

However this is done, there are race conditions where a server can close a connection at the same time as you try to send another message on the connection - and this needs to be handled - I guess normally this is where applications implement retry logic (although it's an argument that libraries should have this - although maybe not `node-fetch`!)

BUT there is a perfect storm that makes this race condition happen every time (100% reproducible for me and my colleagues):
* It looks like Node.js 19 [changed the default agent to have keepalive true](https://github.com/nodejs/node/commit/4267b92604ad78584244488e7f7508a690cb80d0) - previously the default didn't use keep alive.
* But `node-fetch` is [adding a header to close connections if no agent is specified](https://github.com/node-fetch/node-fetch/blob/bcfb71c7d10da252280d13818daab6925e12c368/src/request.js#L292).

Previously, sending the `Connection: close` header explicitly didn't do anything wrong (even if it wasn't strictly needed). BUT sending a connection close down a keepalive connection isn't very nice behaviour - and trips up node's handling of the connection.

The following are three key fixes that could be made - all of which would fix the issue to various degrees:
* `node-fetch` should not default to sending a `Connection: Close` header if the default agent is set up to use keepalive... Maybe it shouldn't send the connection close header at all and should let Node.js handle it? (raised in #1736 )
* `Node.js` could fix itself so that if it receives a `FIN` it immediately doesn't attempt to send more requests on the same connection. (mentioned in this comment: https://github.com/nodejs/node/issues/47130 as point 1)
* `Node.js` could better pre-emptively handle the scenario where a caller sends a `Connection: close` header (mentioned in this comment: https://github.com/nodejs/node/issues/47130 as point 2)

### Related to point the node-fetch point:

The [node docs on http](https://nodejs.org/api/http.html) say this about the `keepalive` option on the agent:

> `keepAlive` [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Boolean_type) - Keep sockets around even when there are no outstanding requests, so they can be used for future requests without having to reestablish a TCP connection. Not to be confused with the `keep-alive` value of the `Connection` header. The `Connection: keep-alive` header is always sent when using an agent except when the Connection header is explicitly specified or when the `keepAlive` and `maxSockets` options are respectively set to `false` and `Infinity`, in which case `Connection: close` will be used. Default: `false`.

This suggests to me that Node.js has decent default handling, and we should be letting Node.js handle this and not take matters into our own hands by sending a confusing `Connection: close` header. By sending the header, we could be interfering with Node.js's ability to keep the socket alive if (for example) the `maxSockets` are reached.

Also - the fact we only set `Connection: close` on the request when a user doesn't provide an agent feels a little weird - either it's worth doing when the agent is set to keepalive or not - regardless of whether we use the default agent or not.

-Finally - perhaps `node-fetch` could consider consider respecting the `keepalive` option of `fetch` itself and create the correct agent - with a cache - to prevent it from using the `default` agent - or not even use the `default` agent at all.-
EDIT: Sorry - I'm wrong. The `keepalive` option on fetch is an entirely separate concept, to do with keeping the connection alive after the page ends in the browser (eg a `navigator.sendBeacon` replacement) and not related to http keepalive - which makes sense - fetch is more high-level than that.

# Logs

## TCP Dump
From running `tcpdump -A -ni lo tcp port 3333` to monitor the TCP messages between the server and the `node-fetch` client.

The key parts are ([see reference](https://gist.github.com/tuxfight3r/9ac030cb0d707bb446c7)):
* A 47630->3333 http connection:close request
* Server responds with the http response, followed by a Flags [F.] `FIN` packet (seq
* Another request attempt on the same connection (same port and seq number continues)
* Server response with the reset flag (Flags [R]) `RST` - reset connection packet.

```
19:28:09.351131 IP 127.0.0.1.47630 > 127.0.0.1.3333: Flags [P.], seq 1:225, ack 1, win 512, options [nop,nop,TS val 109329269 ecr 109329241], length 224

POST <PATH1> HTTP/1.1
Connection: close
Host: 127.0.0.1:3333

19:28:09.351166 IP 127.0.0.1.3333 > 127.0.0.1.47630: Flags [.], ack 225, win 510, options [nop,nop,TS val 109329269 ecr 109329269], length 0
19:28:09.352154 IP 127.0.0.1.3333 > 127.0.0.1.47630: Flags [P.], seq 1:2730, ack 225, win 512, options [nop,nop,TS val 109329270 ecr 109329269], length 2729
HTTP/1.1 200 OK
content-type: application/json
content-length: 2619
date: Wed, 19 Apr 2023 17:28:09 GMT

<<response-payload>>
19:28:09.352163 IP 127.0.0.1.47630 > 127.0.0.1.3333: Flags [.], ack 2730, win 497, options [nop,nop,TS val 109329270 ecr 109329270], length 0
19:28:09.352175 IP 127.0.0.1.3333 > 127.0.0.1.47630: Flags [F.], seq 2730, ack 225, win 512, options [nop,nop,TS val 109329270 ecr 109329270], length 0

// Second request

19:28:09.365378 IP 127.0.0.1.47630 > 127.0.0.1.3333: Flags [P.], seq 225:506, ack 2731, win 512, options [nop,nop,TS val 109329283 ecr 109329270], length 281
POST <PATH2> HTTP/1.1
Content-Type: application/json
Accept: */*
Content-Length: 24
User-Agent: node-fetch/1.0 (+https://github.com/bitinn/node-fetch)
Accept-Encoding: gzip,deflate
Connection: close
Host: 127.0.0.1:3333

<REQUEST_BODY_2>
19:28:09.365401 IP 127.0.0.1.3333 > 127.0.0.1.47630: Flags [R], seq 594996662, win 0, length 0
```

## `NODE_DEBUG=net` logs

From running `NODE_DEBUG=net yarn test`

```
/// FIRST REQUEST

NET 54331: createConnection [
  [Object: null prototype] {
    protocol: 'http:',
    slashes: true,
    auth: null,
    host: '127.0.0.1',
    port: '3333',
    hostname: '127.0.0.1',
    hash: null,
    search: null,
    query: null,
    pathname: '<PATH>',
    path: null,
    href: 'http://127.0.0.1:3333/<URL>',
    method: 'POST',
    headers: [Object: null prototype] {
      Accept: [Array],
      'Content-Length': [Array],
      'User-Agent': [Array],
      'Accept-Encoding': [Array],
      Connection: [Array]
    },
    agent: undefined,
    keepAlive: true,
    scheduling: 'lifo',
    timeout: 5000,
    noDelay: true,
    servername: '',
    _agentKey: '127.0.0.1:3333:',
    encoding: null,
    keepAliveInitialDelay: 1000
  },
  [Function (anonymous)],
  [Symbol(normalizedArgs)]: true
]
NET 54331: pipe false null
NET 54331: connect: attempting to connect to 127.0.0.1:3333 (addressType: 4)
NET 54331: _read - n 16384 isConnecting? true hasHandle? true
NET 54331: _read wait for connection
NET 54331: afterConnect
NET 54331: _read - n 16384 isConnecting? false hasHandle? true
NET 54331: Socket._handle.readStart
NET 54331: _read - n 16384 isConnecting? false hasHandle? true

/// SECOND REQUEST

NET 54331: destroy
NET 54331: close
NET 54331: close handle
```