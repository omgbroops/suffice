import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildCodeGraph, extractImports, rankGraphCandidates } from '../src/code-graph.mjs';

test('extracts literal module forms without comment and string decoys', () => {
  const source = `// import fake from './comment.mjs';
/* export * from './block.mjs'; */
const text = "import fake from './string.mjs'";
const template = \`import('./template.mjs')\`;
import './side.mjs';
import { thing as renamed } from './dependency.mjs';
export { thing } from './reexport.mjs';
const dynamic = import('./dynamic.mjs');
const cjs = require('./cjs.cjs');
const computed = import(target);
object.require('./member.mjs');`;
  assert.deepEqual(extractImports(source).map(({ specifier, kind }) => [specifier, kind]), [
    ['./side.mjs', 'import'], ['./dependency.mjs', 'import'], ['./reexport.mjs', 'reexport'], ['./dynamic.mjs', 'dynamic'], ['./cjs.cjs', 'require'],
  ]);
  assert.equal(extractImports(source)[0].line, 5);
});

test('resolves graph edges, reverse traversal, cycles and deterministic relevance', async () => {
  const root = await mkdtemp(join(tmpdir(), 'suffice-graph-test-'));
  try {
    await mkdir(join(root, 'src', 'helper'), { recursive: true });
    await mkdir(join(root, '.private'));
    const files = {
      'src/main.mjs': "import { reconcile } from './service.mjs'; import './helper'; import 'node:fs'; import '../../escape.mjs';",
      'src/service.mjs': "export { reconcile } from './state.mjs'; import './missing.mjs';",
      'src/state.mjs': "import './service.mjs'; export function reconcile() {}",
      'src/helper/index.js': 'export const help = true;',
      'src/unrelated.mjs': 'export const noise = true;',
      '.private/secret.mjs': "import '../src/main.mjs';",
      'README.md': '# module instructions',
    };
    for (const [path, content] of Object.entries(files)) await writeFile(join(root, path), content);
    const graph = await buildCodeGraph(root);
    assert.equal(graph.nodes.length, 5);
    assert.deepEqual(graph.nodes.find(node => node.path === 'src/service.mjs').importers, ['src/main.mjs', 'src/state.mjs']);
    assert.ok(graph.edges.some(edge => edge.to === 'src/helper/index.js'));
    assert.deepEqual(graph.unresolved.map(item => item.reason).sort(), ['external', 'missing', 'outside-workspace']);
    const dependencies = rankGraphCandidates(graph, { seeds: ['src/main.mjs'], direction: 'dependencies', maxDepth: 2 });
    assert.equal(dependencies[0].path, 'src/main.mjs');
    assert.equal(dependencies.find(item => item.path === 'src/state.mjs').distance, 2);
    assert.ok(!dependencies.some(item => item.path === 'src/unrelated.mjs'));
    const importers = rankGraphCandidates(graph, { seeds: ['src/state.mjs'], direction: 'importers', maxDepth: 2, exclude: ['src/state.mjs'] });
    assert.deepEqual(importers.map(item => item.path), ['src/service.mjs', 'src/main.mjs']);
    assert.deepEqual(rankGraphCandidates(graph, { query: 'reconcile', limit: 2 }).map(item => item.path), ['src/main.mjs', 'src/service.mjs']);
    assert.equal(rankGraphCandidates(graph, { seeds: ['src\\main.mjs'], limit: 1 })[0].path, 'src/main.mjs');
    assert.deepEqual(rankGraphCandidates(graph, { seeds: ['missing'] }), []);
    assert.deepEqual(rankGraphCandidates(graph, { query: 'noise', limit: 0 }), []);
    assert.throws(() => rankGraphCandidates(graph, { direction: 'callers' }), /direction/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
