import http from 'node:http';
import {once} from 'node:events';
import fetch from './source/src/index.js';
const invalidLocation = '//super:invalid:url%/';
const server = http.createServer((request, response) => {
  response.writeHead(302, {Location: invalidLocation});
  response.end();
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
console.log('requesting local redirect; awaiting fetch inside try/catch');
try {
  await fetch(`http://127.0.0.1:${server.address().port}/`);
  console.log('UNEXPECTED: fetch resolved');
  process.exitCode = 1;
} catch (error) {
  console.log('CAUGHT: fetch rejected with an error');
  console.log(JSON.stringify({name: error.name, message: error.message}));
} finally {
  server.close();
}
