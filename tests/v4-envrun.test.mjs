import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sandboxCommand } from '../src/v4-claude.mjs';
import { envrunArgs, startEnvrunBroker } from '../src/v4-envrun.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENVRUN = join(HERE, '..', 'bin', 'envrun');
const THIS_FILE = fileURLToPath(import.meta.url);
const DARWIN = process.platform === 'darwin';
const HAVE_DOCKER = spawnSync('docker', ['image', 'inspect', 'alpine:latest'], { stdio: 'ignore' }).status === 0;

function runAsync(bin, args, opts) {
  return new Promise(resolve => {
    const child = spawn(bin, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    child.on('error', e => resolve({ code: -1, out: String(e) }));
    child.on('close', code => resolve({ code, out }));
  });
}

// Runs a command the way the agent does: wrapped by sandboxCommand, talking to the broker socket.
async function underSandbox(ws, sock, bin, args) {
  const sb = await sandboxCommand(bin, args, ws, sock);
  return runAsync(sb.bin, sb.args, { cwd: ws, env: { ...process.env, ...sb.env, V4_ENVRUN_SOCK: sock } });
}

function setupWs() {
  const root = mkdtempSync(join(tmpdir(), 'envrun-test-'));
  const ws = join(root, 'ws');
  mkdirSync(join(ws, '.git'), { recursive: true });
  writeFileSync(join(ws, 'a.txt'), 'a');
  writeFileSync(join(ws, 'secret_test.py'), 'secret');
  writeFileSync(join(ws, '.git', 'HEAD'), 'x');
  return { root, ws };
}

test('envrunArgs isolates the container and deletes hidden files', () => {
  const argv = envrunArgs({ image: 'img:1', platform: 'linux/amd64', removed: ['/app/t.py'], cmd: 'python -m pytest', name: 'n' });
  assert.ok(argv.includes('--network') && argv[argv.indexOf('--network') + 1] === 'none');
  assert.ok(argv.includes('linux/amd64') && argv.includes('img:1'));
  assert.equal(argv.at(-1), "tar -xf - -C /app && rm -f -- '/app/t.py' && python -m pytest");
});

test('broker: container sees workspace minus hidden file, no network', { skip: !HAVE_DOCKER }, async () => {
  const { root, ws } = setupWs();
  const broker = await startEnvrunBroker({ image: 'alpine:latest', removed: ['/app/secret_test.py'] });
  try {
    const ls = await underSandbox(ws, broker.sock, ENVRUN, ['ls /app']);
    assert.equal(ls.code, 0, ls.out);
    assert.ok(ls.out.split('\n').includes('a.txt'), ls.out);
    assert.ok(!ls.out.includes('secret_test.py'), ls.out);
    const net = await underSandbox(ws, broker.sock, ENVRUN, ['wget -q -T 3 http://1.1.1.1 || echo NONET']);
    assert.ok(net.out.includes('NONET'), net.out);
  } finally {
    await broker.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('sandboxed agent cannot run docker', { skip: !DARWIN || !HAVE_DOCKER }, async () => {
  const { root, ws } = setupWs();
  const broker = await startEnvrunBroker({ image: 'alpine:latest', removed: [] });
  try {
    const ps = await underSandbox(ws, broker.sock, 'docker', ['ps']);
    assert.notEqual(ps.code, 0, ps.out);
  } finally {
    await broker.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('sandboxed agent cannot read the repo tree', { skip: !DARWIN }, async () => {
  const { root, ws } = setupWs();
  const broker = await startEnvrunBroker({ image: 'alpine:latest', removed: [] });
  try {
    const cat = await underSandbox(ws, broker.sock, '/bin/cat', [THIS_FILE]);
    assert.notEqual(cat.code, 0, cat.out);
  } finally {
    await broker.close();
    rmSync(root, { recursive: true, force: true });
  }
});
