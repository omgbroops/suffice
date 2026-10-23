// CONNECT only: model clients retain TLS and their own authentication. No body/header logging.
import {createServer} from 'node:http';
import {connect as openSocket} from 'node:net';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export const MODEL_HOSTS = Object.freeze(['api.openai.com', 'chatgpt.com', 'auth.openai.com']);
export function modelDestination(authority) {
  const match = /^([a-z0-9.-]+):443$/i.exec(String(authority));
  return match && MODEL_HOSTS.includes(match[1].toLowerCase()) ? match[1].toLowerCase() : null;
}
export function createModelProxy({connect = openSocket, log = () => {}} = {}) {
  const server = createServer((_request, response) => {response.writeHead(405); response.end();});
  server.on('connect', (request, client, head) => {
    const host = modelDestination(request.url);
    if (!host) {log({at: new Date().toISOString(), event: 'denied', destination: /^[a-z0-9.-]+:\d+$/i.test(request.url) ? String(request.url).slice(0, 120) : '[invalid authority]'}); client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;}
    const upstream = connect({host, port: 443});
    upstream.setTimeout(120_000, () => upstream.destroy());
    upstream.once('connect', () => {
      log({at: new Date().toISOString(), event: 'connected', host, port: 443});
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      upstream.pipe(client); client.pipe(upstream);
    });
    client.on('error', () => upstream.destroy()); client.on('close', () => upstream.destroy());
    upstream.on('error', () => {client.destroy(); log({at: new Date().toISOString(), event: 'upstream_error', host});});
    upstream.on('close', () => client.destroy());
  });
  server.on('clientError', (_error, socket) => socket.destroy());
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  createModelProxy({log: entry => process.stdout.write(JSON.stringify(entry) + '\n')}).listen(3128, '0.0.0.0');
}
