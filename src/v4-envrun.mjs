// Broker for bin/envrun: the sandboxed agent sends its workspace tar over a unix socket and only this process holds docker.
// Node built-ins only. Frames: 1 byte type (1 = output, 2 = exit code int32 BE), 4 byte BE length, payload.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TIMEOUT_MS = 240_000;
const sq = s => `'${s.replace(/'/g, `'\\''`)}'`;

// docker run args for one envrun call. --network none and the hidden-file rm are the isolation.
// runScript (optional) is one host file mounted read-only as /run_tests.sh; never the eval dir (it holds hidden tests).
export function envrunArgs({ image, platform, removed = [], runScript, cmd, name }) {
  const rm = removed.length ? `rm -f -- ${removed.map(sq).join(' ')} && ` : '';
  const plat = platform ? ['--platform', platform] : [];
  const mount = runScript ? ['-v', `${runScript}:/run_tests.sh:ro`] : [];
  return ['run', '--rm', '-i', '--name', name, ...plat, '--network', 'none', '--cpus', '2', '--memory', '3g', ...mount,
    '-w', '/app', '--entrypoint', 'sh', image, '-c', `tar -xf - -C /app && ${rm}${cmd}`];
}

const frame = (type, payload) => {
  const head = Buffer.alloc(5);
  head[0] = type;
  head.writeUInt32BE(payload.length, 1);
  return Buffer.concat([head, payload]);
};
const exitFrame = code => { const b = Buffer.alloc(4); b.writeInt32BE(code); return frame(2, b); };

// One broker per task. Image and hidden list come from the harness, never from the client.
export async function startEnvrunBroker({ image, platform, removed, runScript }) {
  const dir = await mkdtemp(join(tmpdir(), 'v4-envrun-'));
  const sock = join(dir, 's.sock');
  const open = new Set();
  const server = createServer({ allowHalfOpen: true }, socket => {
    open.add(socket);
    socket.on('close', () => open.delete(socket));
    serve(socket, { image, platform, removed, runScript });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(sock, resolve); });
  return {
    sock,
    close: async () => {
      for (const s of open) s.destroy();
      await new Promise(resolve => server.close(() => resolve()));
      await rm(dir, { recursive: true, force: true });
    },
  };
}

function serve(socket, { image, platform, removed, runScript }) {
  socket.on('error', () => {});
  let head = Buffer.alloc(0);
  const onData = chunk => {
    head = Buffer.concat([head, chunk]);
    const nl = head.indexOf(10);
    if (nl < 0) return;
    socket.removeListener('data', onData);
    let cmd = null;
    try { cmd = JSON.parse(head.subarray(0, nl).toString()).cmd; } catch { /* bad header: reported below */ }
    if (typeof cmd !== 'string' || !cmd) {
      socket.end(Buffer.concat([frame(1, Buffer.from('envrun: bad request header\n')), exitFrame(2)]));
      return;
    }
    const name = `envrun-${randomUUID()}`;
    const docker = spawn('docker', envrunArgs({ image, platform, removed, runScript, cmd, name }), { stdio: ['pipe', 'pipe', 'pipe'] });
    docker.stdin.on('error', () => {}); // docker exiting early closes stdin; its exit code is the answer
    const out = data => { if (!socket.destroyed) socket.write(frame(1, data)); };
    docker.stdout.on('data', out);
    docker.stderr.on('data', out);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      spawn('docker', ['rm', '-f', name], { stdio: 'ignore' });
      docker.kill();
    }, TIMEOUT_MS);
    let done = false;
    const finish = (code, message) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (message) out(Buffer.from(message));
      if (!socket.destroyed) socket.end(exitFrame(code));
    };
    docker.on('error', error => finish(127, `envrun: ${error.message}\n`));
    docker.on('close', code => finish(timedOut ? 124 : code ?? 1));
    const rest = head.subarray(nl + 1);
    if (rest.length) docker.stdin.write(rest);
    socket.pipe(docker.stdin);
  };
  socket.on('data', onData);
}
