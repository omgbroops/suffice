import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {hash} from '../src/v9/workspace.mjs';
import {runProcess} from '../src/v9/process.mjs';
import {publicActorTask, schedulePairs, closeActorBox, closeRelay, runBox, runIndependentLanes, bindImageCode} from '../scripts/poly27-bench.mjs';
test('public actor request omits grader paths and protects build files even when metadata calls them solutions', () => {
  const value = publicActorTask({id:'rust_example',taskId:'rust/example',lang:'rust',name:'example',prompt:'Implement the API',solutionFiles:['src/lib.rs','Cargo.toml'],
    actorFiles:[{path:'src/lib.rs'},{path:'Cargo.toml'},{path:'TASK.md'}],immutablePaths:['TASK.md'],graderDescriptor:'/secret/tests.json',expectedAnswers:['secret']});
  assert.deepEqual(value.immutablePaths,['TASK.md','Cargo.toml']);
  assert.equal(Object.hasOwn(value,'graderDescriptor'),false); assert.equal(Object.hasOwn(value,'expectedAnswers'),false);
});
test('paired schedule has all54 unique attempts and one independent entry per arm/task', () => {
  const tasks=Array.from({length:27},(_,i)=>({id:`task_${i}`})), schedule=schedulePairs(tasks);
  assert.equal(schedule.length,54); assert.equal(new Set(schedule.map(s=>s.id)).size,54); assert.deepEqual(schedule,schedulePairs(tasks));
  assert.notDeepEqual(schedule,schedulePairs(tasks,12));
  for(const task of tasks) assert.deepEqual(schedule.filter(s=>s.taskId===task.id).map(s=>s.strategy).sort(),['native','v10']);
});

const ok = (stdout = '') => ({exitCode: 0, stdout, stderr: '', timedOut: false, overflow: false, aborted: false});
async function temporary(t) {
  const directory = await mkdtemp(join(tmpdir(), 'poly27-bench-test-'));
  t.after(() => rm(directory, {recursive: true, force: true})); return directory;
}

test('auth synchronization waits for confirmed stop and atomically replaces only the private store', async t => {
  const directory = await temporary(t), store = join(directory, 'auth.json');
  await writeFile(store, 'old synthetic credential');
  const calls = []; let running = true;
  const dockerRun = async args => {
    calls.push(args);
    if (args[0] === 'inspect') return ok(JSON.stringify({Running: running}));
    if (args[0] === 'stop') {running = false; return ok();}
    if (args[0] === 'cp') {
      assert.equal(running, false); assert.equal(await readFile(store, 'utf8'), 'old synthetic credential');
      assert.notEqual(args[2], store); await writeFile(args[2], 'new synthetic credential');
    }
    return ok();
  };
  const result = await closeActorBox({name: 'actor', network: 'net', proxyName: 'proxy', created: true, strategy: 'v10', authStore: store, dockerRun});
  assert.equal(result.authSync.status, 'updated'); assert.equal(result.stopped, true); assert.equal(result.safeToContinue, true);
  assert.equal(await readFile(store, 'utf8'), 'new synthetic credential');
  assert.ok(calls.findIndex(a => a[0] === 'stop') < calls.findIndex(a => a[0] === 'cp'));
  assert.ok(calls.some(a => a[0] === 'rm')); assert.ok(calls.some(a => a[0] === 'network' && a[1] === 'rm'));
  assert.deepEqual(await readdir(directory), ['auth.json']);
});

test('failed atomic auth replacement preserves a sealed attempt and still removes container/network', async t => {
  const directory = await temporary(t), store = join(directory, 'private-auth.json'), attemptDir = join(directory, 'attempt');
  await writeFile(store, 'old synthetic credential');
  const calls = []; let network;
  const dockerRun = async args => {
    calls.push(args);
    if (args[0] === 'network' && args[1] === 'create') network = args.at(-1);
    if (args[0] === 'inspect' && args[1] === 'proxy') return ok(JSON.stringify([{NetworkSettings: {Networks: {[network]: {IPAddress: '172.20.0.2'}}}}]));
    if (args[0] === 'inspect') return ok(JSON.stringify({Running: false}));
    if (args[0] === 'start') {
      await writeFile(join(attemptDir, 'attempt.json'), JSON.stringify({status: 'completed', patchSha256: 'sealed-patch', costKnown: true, costUsd: .1}));
      await writeFile(join(attemptDir, 'patch.diff'), 'sealed source diff');
    }
    if (args[0] === 'cp') await writeFile(args[2], 'new synthetic credential');
    return ok();
  };
  const task = {id: 'example', name: 'example', taskId: 'python/example', lang: 'python', prompt: 'Implement.', solutionFiles: ['main.py'], actorFiles: [], immutablePaths: [], workspace: directory};
  const result = await runBox({image: 'image', proxy: {name: 'proxy'}, directory: attemptDir, task, strategy: 'v10', timeoutMs: 1000,
    authStores: {v10: store}, dockerRun, replaceAuth: async () => {throw Error('synthetic rename denied');}});
  assert.equal(result.status, 'completed'); assert.equal(result.patchSha256, 'sealed-patch'); assert.equal(result.costUsd, .1);
  assert.equal(result.cleanup.authSync.status, 'failed'); assert.match(result.cleanup.authSync.error, /rename denied/);
  assert.equal(result.cleanup.safeToContinue, true); assert.equal(await readFile(store, 'utf8'), 'old synthetic credential');
  assert.equal(await readFile(join(attemptDir, 'patch.diff'), 'utf8'), 'sealed source diff');
  assert.ok(calls.some(a => a[0] === 'rm')); assert.ok(calls.some(a => a[0] === 'network' && a[1] === 'disconnect'));
  assert.ok(calls.some(a => a[0] === 'network' && a[1] === 'rm'));
  const recorded = JSON.parse(await readFile(join(attemptDir, 'cleanup.json'), 'utf8')); assert.equal(recorded.authSync.status, 'failed');
  assert.ok(!(await readdir(directory)).some(name => name.endsWith('.next')));
});

test('unconfirmed stop forbids auth copying and unconfirmed removal fails closed', async () => {
  const calls = [];
  const result = await closeActorBox({name: 'actor', network: 'net', proxyName: 'proxy', created: true, strategy: 'native', authStore: 'unused',
    dockerRun: async args => {calls.push(args); if (args[0] === 'inspect') return ok(JSON.stringify({Running: true})); if (args[0] === 'ps') return ok('still-present\n'); return ok();}});
  assert.equal(result.stopped, false); assert.equal(result.safeToContinue, false); assert.equal(result.authSync.status, 'failed');
  assert.ok(!calls.some(a => a[0] === 'cp')); assert.ok(calls.some(a => a[0] === 'network' && a[1] === 'rm'));
});

test('concurrent client lanes synchronize separate opaque stores without crossing authentication paths', async t => {
  const directory = await temporary(t), paths = Object.fromEntries(['v10', 'native'].map(strategy => [strategy, join(directory, strategy + '.json')]));
  for (const path of Object.values(paths)) await writeFile(path, 'synthetic original');
  await Promise.all(['v10', 'native'].map(strategy => closeActorBox({name: strategy, network: strategy + '-net', proxyName: 'proxy', created: true, strategy, authStore: paths[strategy],
    dockerRun: async args => {
      if (args[0] === 'inspect') return ok(JSON.stringify({Running: false}));
      if (args[0] === 'cp') {
        assert.ok(args[1].startsWith(strategy + ':'));
        assert.ok(args[1].includes(strategy === 'v10' ? '/opt/suffice/.suffice/pi/' : '/home/node/.codex/'));
        assert.ok(args[2].startsWith(paths[strategy] + '.'));
        await writeFile(args[2], 'synthetic refreshed ' + strategy);
      }
      return ok();
    }})));
  for (const strategy of ['v10', 'native']) assert.equal(await readFile(paths[strategy], 'utf8'), 'synthetic refreshed ' + strategy);
});

test('unsafe closure latches both auth lanes off while preserving already-running attempts', async () => {
  const schedule = ['first', 'second'].flatMap(taskId => ['v10', 'native'].map(strategy => ({id: taskId + '-' + strategy, taskId, strategy})));
  const called = [], recorded = [];
  const result = await runIndependentLanes(schedule, async item => {
    called.push(item.id);
    if (item.strategy === 'native') await new Promise(resolve => setTimeout(resolve, 5));
    return {...item, cleanup: {safeToContinue: item.strategy !== 'v10'}};
  }, async row => {recorded.push(row.id);});
  assert.equal(result.halted, true); assert.deepEqual(called.sort(), ['first-native', 'first-v10']);
  assert.equal(recorded.length, 2); assert.equal(result.attempts.length, 2);
});

test('relay removal still runs when writing its logs fails', async () => {
  const calls = [];
  const result = await closeRelay({name: 'relay', directory: 'unused', dockerRun: async args => {calls.push(args); return ok('relay metadata');}, write: async () => {throw Error('synthetic disk failure');}});
  assert.equal(result.removed, true); assert.equal(result.errors[0].step, 'relay_logs');
  assert.ok(calls.some(a => a[0] === 'rm' && a[2] === 'relay'));
});

test('code binding probes only the pinned offline image and authenticates every requested file', async t => {
  const directory = await temporary(t), image = 'sha256:' + 'a'.repeat(64), paths = ['package.json', 'src/runtime.mjs'];
  await mkdir(join(directory, 'src')); await writeFile(join(directory, paths[0]), '{}'); await writeFile(join(directory, paths[1]), 'export const version=1;');
  const rows = [{path: paths[0], sha256: hash('{}')}, {path: paths[1], sha256: hash('export const version=1;')}];
  let probe;
  const result = await bindImageCode(image, paths, {hostRoot: directory, dockerRun: async args => {probe = args; return ok(JSON.stringify(rows));}});
  assert.equal(result.image, image); assert.deepEqual(result.files, rows); assert.equal(result.codeSha256, hash(JSON.stringify(rows)));
  assert.equal(probe[probe.indexOf('--network') + 1], 'none'); assert.ok(probe.includes('--read-only')); assert.ok(probe.includes(image));
  assert.ok(!probe.includes('--mount')); assert.equal(probe.at(-1), JSON.stringify(paths));
  const syntax = await runProcess(process.execPath, ['--check', '--input-type=module'], {input: probe[probe.indexOf('-e') + 1], timeoutMs: 5000});
  assert.equal(syntax.exitCode, 0, syntax.stderr);
  await writeFile(join(directory, paths[1]), 'export const version=2;');
  await assert.rejects(bindImageCode(image, paths, {hostRoot: directory, dockerRun: async () => ok(JSON.stringify(rows))}), /differs/);
  await assert.rejects(bindImageCode(image, paths, {hostRoot: directory, dockerRun: async () => ok(JSON.stringify(rows.slice(0, 1)))}), /differs/);
  await assert.rejects(bindImageCode('mutable:tag', paths, {hostRoot: directory}), /immutable/);
});
