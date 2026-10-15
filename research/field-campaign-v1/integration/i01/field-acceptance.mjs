import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import fetch from './src/index.js';

const server = http.createServer((req, res) => {
  if (req.url === '/destination') return res.end('arrived');
  res.statusCode = Number(req.url.split('/')[1]) || 302;
  res.setHeader('location', req.url.endsWith('bad') ? '//super:invalid:url%/' : '/destination');
  res.end('redirect body');
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
try {
  for (const status of [301, 302, 307, 308]) {
    // The issue requires malformed locations to reject through the promise.
    await assert.rejects(fetch(`${base}/${status}/bad`), error => error instanceof Error);
    // The documented manual mode exposes the redirect response to its caller.
    const manual = await fetch(`${base}/${status}/bad`, {redirect: 'manual'});
    assert.equal(manual.status, status);
    assert.equal(manual.headers.get('location'), '//super:invalid:url%/');
    assert.equal(await manual.text(), 'redirect body');
    const followed = await fetch(`${base}/${status}/good`);
    assert.equal(await followed.text(), 'arrived');
    assert.equal(followed.redirected, true);
  }
  console.log('invalid redirect rejection, manual response and valid follow controls passed');
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
