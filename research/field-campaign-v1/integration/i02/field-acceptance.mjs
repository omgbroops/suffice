import assert from 'node:assert/strict';
import http from 'node:http';
import zlib from 'node:zlib';
import {once} from 'node:events';
import fetch from './src/index.js';

const value = 'compressed response contract';
const server = http.createServer((req, res) => {
  res.setHeader('content-encoding', req.url === '/gzip' ? 'gzip' : 'deflate');
  if (req.url === '/empty-chunked') {
    res.writeHead(200, {'transfer-encoding': 'chunked'});
    return res.end();
  }
  if (req.url === '/empty-length') res.setHeader('content-length', '0');
  if (req.url.startsWith('/empty')) return res.end();
  res.end(req.url === '/raw' ? zlib.deflateRawSync(value) : req.url === '/gzip' ? zlib.gzipSync(value) : zlib.deflateSync(value));
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
async function within(promise) {
  let timer;
  try {return await Promise.race([promise, new Promise((_, reject) => {timer = setTimeout(() => reject(new Error('response promise did not settle')), 1800);})]);}
  finally {clearTimeout(timer);}
}
try {
  for (const path of ['/empty-length', '/empty-chunked', '/empty']) {
    const result = await within(fetch(base + path));
    assert.equal(result.status, 200);
    assert.equal(await within(result.text()), '');
  }
  for (const path of ['/zlib', '/raw', '/gzip']) {
    const result = await within(fetch(base + path));
    assert.equal(await within(result.text()), value);
  }
  console.log('empty deflate framing and nonempty compression controls passed');
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
