import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {mkdtemp, readFile, access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {safeRelativePath, unpackSourceArchive, selectTaskFiles, preparePoly27, supplementRustBuild, RUST_CRATE_PINS, SOURCE, sha256} from '../scripts/poly27-prepare.mjs';

const record = value => ({bytes: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)), mode: 0o644});
function sourceFor(id, files, more = {}) {
  const [lang, name] = id.split('/'), prefix = `${lang}/exercises/practice/${name}/`;
  return new Map(Object.entries({'.meta/config.json': record({files}), '.docs/instructions.md': record('Public requirements'), ...more}).map(([p, r]) => [prefix + p, r]));
}
function archive(entries) {
  const chunks = [];
  for (const {name, type = '0', content = ''} of entries) {
    const header = Buffer.alloc(512), bytes = Buffer.from(content);
    header.write(name, 0, 100); header.write('0000644\0', 100); header.write('0000000\0', 108); header.write('0000000\0', 116);
    header.write(bytes.length.toString(8).padStart(11, '0') + '\0', 124); header.write('00000000000\0', 136);
    header.fill(32, 148, 156); header.write(type, 156); header.write('ustar\0', 257);
    header.write([...header].reduce((sum, b) => sum + b, 0).toString(8).padStart(6, '0') + '\0 ', 148);
    chunks.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]));
}

test('metadata traversal, Windows alternate streams, and ambiguous names cannot reach output paths', () => {
  for (const path of ['../secret', '/root/file', 'C:/secret', 'a\\b', 'a//b', './a', 'a/../b', 'a:stream', 'x/NUL.txt', 'trailing./file', 'space /file']) {
    assert.throws(() => safeRelativePath(path), /Unsafe relative path/, path);
  }
  assert.equal(safeRelativePath('.docs/instructions.md'), '.docs/instructions.md');
  const files = {solution: ['../../escape.py'], test: ['check_test.py'], example: ['.meta/example.py']};
  assert.throws(() => selectTaskFiles(sourceFor('python/sample', files), {taskId: 'python/sample'}), /Unsafe relative path/);
});

test('archive validation rejects links, traversal, duplicate spellings, and file ancestors', () => {
  for (const entries of [
    [{name: 'root/link', type: '2'}],
    [{name: 'root/link', type: '1'}],
    [{name: 'root/../escape'}],
    [{name: 'other/file'}],
    [{name: 'root/Case.py'}, {name: 'root/case.py'}],
    [{name: 'root/dir'}, {name: 'root/dir/file'}],
  ]) assert.throws(() => unpackSourceArchive(archive(entries), 'root'));
  const files = unpackSourceArchive(archive([{name: 'root/file', content: 'safe'}]), 'root');
  assert.equal(files.get('file').bytes.toString(), 'safe');
});

test('all tests and references stay private even when canonical files.test omits them', () => {
  const metadata = {solution: ['sample.go'], test: ['sample_test.go'], example: ['.meta/example.go'], editor: ['cases_test.go'], invalidator: ['go.mod']};
  const source = sourceFor('go/sample', metadata, {
    'sample.go': record('package sample'), 'sample_test.go': record('SECRET assertion 1'),
    'cases_test.go': record('SECRET case table'), 'bonus_test.go': record('SECRET bonus assertions'),
    '.meta/example.go': record('SECRET reference answer'), '.meta/notes.md': record('SECRET solution notes'),
    '.approaches/fast/content.md': record('SECRET approach'), 'go.mod': record('module sample'),
    '.docs/hints.md': record('Hint outside the public problem statement'),
  });
  const selected = selectTaskFiles(source, {taskId: 'go/sample'});
  assert.deepEqual([...selected.hiddenTests.keys()].sort(), ['bonus_test.go', 'cases_test.go', 'sample_test.go']);
  assert.equal(selected.referenceFiles.get('.meta/example.go').bytes.toString(), 'SECRET reference answer');
  assert.ok([...selected.publicFiles.values()].every(r => !r.bytes.toString().includes('SECRET')));
  assert.ok(!selected.publicFiles.has('.docs/hints.md'));
  assert.deepEqual(selected.referenceMapping, [{from: '.meta/example.go', to: 'sample.go'}]);
});

test('public C++ build harness remains available while exercise-specific assertions are withheld', () => {
  const metadata = {solution: ['sublist.cpp', 'sublist.h'], test: ['sublist_test.cpp'], example: ['.meta/example.cpp', '.meta/example.h']};
  const source = sourceFor('cpp/sublist', metadata, Object.fromEntries([
    'sublist.cpp', 'sublist.h', 'sublist_test.cpp', '.meta/example.cpp', '.meta/example.h', 'CMakeLists.txt', 'test/catch.hpp', 'test/tests-main.cpp',
  ].map(p => [p, record(p)])));
  const selected = selectTaskFiles(source, {taskId: 'cpp/sublist'});
  assert.ok(selected.publicFiles.has('test/catch.hpp')); assert.ok(selected.publicFiles.has('test/tests-main.cpp'));
  assert.ok(!selected.publicFiles.has('sublist_test.cpp')); assert.equal(selected.hiddenTests.size, 1);
  assert.match(selected.publicApi, /List_comparison/); assert.doesNotMatch(selected.publicApi, /assert|return|for\s*\(/);
});

test('missing or overlapping canonical files are rejected before fixtures are written', () => {
  const meta = {solution: ['same.py'], test: ['same.py'], example: ['.meta/example.py']};
  assert.throws(() => selectTaskFiles(sourceFor('python/sample', meta, {'same.py': record('stub'), '.meta/example.py': record('answer')}), {taskId: 'python/sample'}), /overlaps hidden/);
  const missing = {...meta, solution: ['missing.py']};
  assert.throws(() => selectTaskFiles(sourceFor('python/sample', missing), {taskId: 'python/sample'}), /Metadata file missing/);
});

test('preparation requires an explicit destination and verifies the archive before writing', async () => {
  await assert.rejects(preparePoly27(), /explicit output/);
  const dir = await mkdtemp(join(tmpdir(), 'poly27-pin-test-')), bad = join(dir, 'bad.tgz'), output = join(dir, 'output');
  const {writeFile} = await import('node:fs/promises'); await writeFile(bad, archive([{name: 'root/file'}]));
  await assert.rejects(preparePoly27({output, archivePath: bad}), /pin mismatch/);
  await assert.rejects(access(output), {code: 'ENOENT'});
});

test('Rust environment supplements expose identical pinned build support and preserve upstream provenance', () => {
  for (const [id, name, direct] of [['rust/pig-latin', 'pig-latin', ['regex']], ['rust/decimal', 'decimal', ['num-bigint', 'num-traits']]]) {
    const original = Buffer.from(`[package]\nedition = "2021"\nname = "${name}"\nversion = "1.0.0"\n`);
    const publicFiles = new Map([['Cargo.toml', {bytes: original, mode: 0o644}], ['src/lib.rs', record('unchanged public stub')]]);
    const supplement = supplementRustBuild(id, publicFiles), manifest = publicFiles.get('Cargo.toml').bytes.toString(), lock = publicFiles.get('Cargo.lock').bytes.toString();
    assert.equal(supplement.originalFiles[0].sha256, sha256(original));
    assert.equal(supplement.suppliedFiles[0].sha256, sha256(publicFiles.get('Cargo.toml').bytes));
    assert.equal(supplement.suppliedFiles[1].sha256, sha256(publicFiles.get('Cargo.lock').bytes));
    assert.equal(publicFiles.get('src/lib.rs').bytes.toString(), 'unchanged public stub');
    assert.ok(!original.toString().includes('[dependencies]'));
    for (const dependency of direct) assert.ok(manifest.includes(`${dependency} = "=${RUST_CRATE_PINS[dependency].version}"`));
    for (const [dependency, pin] of Object.entries(supplement.registryPins)) {
      assert.ok(lock.includes(`name = "${dependency}"\nversion = "${pin.version}"`)); assert.ok(lock.includes(`checksum = "${pin.checksum}"`));
      assert.ok(pin.dependencies.every(d => Object.hasOwn(supplement.registryPins, d)), `Unfrozen transitive dependency of ${dependency}`);
    }
    assert.doesNotMatch(manifest + lock, /assert|fn translate|struct Decimal|testcase/);
  }
  assert.equal(supplementRustBuild('rust/accumulate', new Map()), null);
});

const localArchive = join(import.meta.dirname, '../.suffice/poly27-source-inspect/source.tar.gz');
let localBytes;
try {localBytes = await readFile(localArchive);} catch (error) {if (error.code !== 'ENOENT') throw error;}
test('pinned canonical cohort prepares 27 public-only workspaces and stable complete grader manifests', {skip: !localBytes}, async () => {
  assert.equal(sha256(localBytes), SOURCE.archiveSha256);
  const output = await mkdtemp(join(tmpdir(), 'poly27-cohort-test-'));
  const first = await preparePoly27({output, archivePath: localArchive});
  const tasks = JSON.parse(await readFile(first.publicTasksPath, 'utf8'));
  assert.equal(tasks.length, 27); assert.equal(new Set(tasks.map(t => t.taskId)).size, 27);
  for (const task of tasks) {
    const descriptor = JSON.parse(await readFile(task.graderDescriptor, 'utf8'));
    assert.equal(task.workspace.split(/[\\/]/).at(-1), task.name);
    const publicPaths = new Set(task.actorFiles.map(f => f.path));
    assert.ok(descriptor.hiddenFiles.length > 0); assert.ok(descriptor.referenceFiles.length > 0);
    for (const item of [...descriptor.hiddenFiles, ...descriptor.referenceFiles]) assert.ok(!publicPaths.has(item.path), `${task.id}/${item.path}`);
    assert.ok(![...publicPaths].some(p => p.split('/').some(part => ['.meta', '.approaches'].includes(part))));
    for (const item of task.actorFiles) assert.equal(sha256(await readFile(join(task.workspace, item.path))), item.sha256);
    if (['rust_pig-latin', 'rust_decimal'].includes(task.id)) {
      assert.ok(descriptor.environmentSupplement); assert.ok(publicPaths.has('Cargo.lock'));
      const upstream = unpackSourceArchive(localBytes).get(`rust/exercises/practice/${task.name}/Cargo.toml`).bytes;
      assert.equal(descriptor.environmentSupplement.originalFiles[0].sha256, sha256(upstream));
      assert.ok(descriptor.build.dependencyResolutionFrozen);
    }
  }
  const again = await preparePoly27({output, archivePath: localArchive});
  assert.deepEqual(again.preparation, first.preparation);
});
