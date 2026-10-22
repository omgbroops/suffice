import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENVRUN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'envrun');

// Fake docker: records its argv, saves the tar stream it receives, exits 7.
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'envrun-test-'));
  const bin = join(root, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'docker'), '#!/bin/sh\nprintf "%s\\n" "$@" > "$FAKE_ARGS"\ncat > "$FAKE_STDIN"\nexit 7\n');
  chmodSync(join(bin, 'docker'), 0o755);
  const ws = join(root, 'ws');
  mkdirSync(join(ws, 'tests'), { recursive: true });
  mkdirSync(join(ws, '.git'));
  writeFileSync(join(ws, 'a.txt'), 'a');
  writeFileSync(join(ws, 'tests', 't.py'), 't');
  writeFileSync(join(ws, '.git', 'HEAD'), 'x');
  return { root, bin, ws };
}

function run(ws, bin, args, env) {
  const out = join(ws, '..', 'args.txt');
  const stdin = join(ws, '..', 'stdin.tar');
  const res = spawnSync(ENVRUN, args, { cwd: ws, encoding: 'utf8', env: { PATH: `${bin}:${process.env.PATH}`, FAKE_ARGS: out, FAKE_STDIN: stdin, ...env } });
  return { res, argv: existsArgs(out) ? readFileSync(out, 'utf8').split('\n') : null, stdin };
}
const existsArgs = p => { try { readFileSync(p); return true; } catch { return false; } };

test('envrun builds the container command, deletes hidden files, streams the workspace minus .git', () => {
  const { bin, ws } = setup();
  const { res, argv, stdin } = run(ws, bin, ['python', '-m', 'pytest', '-q'], { V4_ENV_IMAGE: 'img:1', V4_ENV_REMOVED: 'tests/t.py\nodd name.py', V4_ENV_PLATFORM: 'linux/amd64' });
  assert.equal(res.status, 7);
  assert.ok(argv.includes('--network') && argv[argv.indexOf('--network') + 1] === 'none');
  assert.ok(argv.includes('linux/amd64'));
  assert.ok(argv.includes('img:1'));
  const script = argv[argv.indexOf('-c') + 1];
  assert.equal(script, "tar -xf - -C /app && rm -f -- 'tests/t.py' 'odd name.py' && python -m pytest -q");
  const listing = spawnSync('tar', ['-tf', stdin], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  assert.ok(listing.includes('./a.txt') || listing.includes('a.txt'));
  assert.ok(!listing.some(f => f.includes('.git')));
});

test('envrun without V4_ENV_REMOVED skips rm, and refuses without an image', () => {
  const { bin, ws } = setup();
  const ok = run(ws, bin, ['echo', 'hi'], { V4_ENV_IMAGE: 'img:1' });
  assert.equal(ok.argv[ok.argv.indexOf('-c') + 1], 'tar -xf - -C /app && echo hi');
  const bad = run(ws, bin, ['echo', 'hi'], { V4_ENV_IMAGE: '' });
  assert.equal(bad.res.status, 2);
});
