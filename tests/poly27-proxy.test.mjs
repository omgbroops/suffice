import {test} from 'node:test';
import assert from 'node:assert/strict';
import {connect} from 'node:net';
import {once} from 'node:events';
import {modelDestination, createModelProxy} from '../scripts/poly27-proxy.mjs';
test('proxy allows exact model TLS endpoints and rejects authority tricks or arbitrary egress', () => {
  assert.equal(modelDestination('API.OPENAI.COM:443'), 'api.openai.com');
  for (const target of ['api.openai.com:80','github.com:443','api.openai.com.evil.test:443','127.0.0.1:443','169.254.169.254:443','user@api.openai.com:443','api.openai.com:443/path','api.openai.com%00:443','https://api.openai.com:443']) assert.equal(modelDestination(target), null);
});
test('rejected CONNECT requests never open an upstream socket', async () => {
  let connections = 0; const server = createModelProxy({connect: () => {connections++; throw Error('Unexpected upstream');}});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const client = connect(server.address().port, '127.0.0.1'); let output = ''; client.on('data', value => output += value);
  client.write('CONNECT github.com:443 HTTP/1.1\r\nHost: github.com:443\r\n\r\n'); await once(client, 'end');
  assert.match(output, /403 Forbidden/); assert.equal(connections, 0); client.destroy(); await new Promise(resolve => server.close(resolve));
});
