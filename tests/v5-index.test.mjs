import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildIndex, locate, localize, snippet, terms, symbolsOf } from '../src/v5-index.mjs';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'v5-idx-'));
  const put = async (rel, text) => { await mkdir(join(root, rel, '..'), { recursive: true }); await writeFile(join(root, rel), text); };
  await put('billing/invoice.py', 'import os\n\nclass InvoiceBuilder:\n    pass\n\ndef compute_total(items):\n    return sum(items)\n');
  await put('utils/strings.js', 'export function slugify(s) {\n  return s.toLowerCase();\n}\nconst trim = (s) => s.trim();\n');
  await put('util/readme.md', '# Notes\nslugify docs\n');
  await put('node_modules/x/bad.js', 'function compute_total() {}\n');
  await put('img/logo.png', 'binary');
  await put('big/huge.py', 'x = 1\n'.repeat(80_000)); // > 300KB
  return root;
}

test('terms split camelCase and snake_case, drop stopwords', () => {
  const t = terms('The computeTotal_value of InvoiceBuilder is wrong');
  for (const w of ['compute', 'total', 'value', 'invoice', 'builder', 'computetotal_value']) assert.ok(t.includes(w), w);
  assert.ok(!t.includes('the') && !t.includes('is'));
});

test('symbolsOf finds py/js/go/rust/java/c declarations and skips call lines', () => {
  assert.deepEqual(symbolsOf('py', 'def a():\n  return b(c)\nclass K:\n').map(s => s.name), ['a', 'K']);
  assert.deepEqual(symbolsOf('js', 'export const f = (x) => x;\nfunction g() {}\n').map(s => s.name), ['f', 'g']);
  assert.deepEqual(symbolsOf('go', 'func (r *R) Run() {}\n').map(s => s.name), ['Run']);
  assert.deepEqual(symbolsOf('rust', 'pub fn parse() {}\n').map(s => s.name), ['parse']);
  assert.deepEqual(symbolsOf('java', 'public void run() {\n  return foo(x);\n}\n').map(s => s.name), ['run']);
  assert.deepEqual(symbolsOf('c', 'int add(int a, int b) {\n').map(s => s.name), ['add']);
});

test('buildIndex skips node_modules, binaries and oversized files', async () => {
  const root = await fixture();
  try {
    const idx = await buildIndex(root);
    assert.deepEqual(idx.docs.map(d => d.rel).sort(), ['billing/invoice.py', 'util/readme.md', 'utils/strings.js']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('locate ranks by symbol/path match; backtick and path mentions are strong', async () => {
  const root = await fixture();
  try {
    const idx = await buildIndex(root);
    const r = locate(idx, 'compute_total returns the wrong sum for empty lists');
    assert.equal(r.files[0].path, 'billing/invoice.py');
    assert.equal(r.files[0].symbols[0].name, 'compute_total');
    assert.equal(r.files[0].symbols[0].line, 6);
    assert.equal(r.symbols[0].name, 'compute_total');

    // Literal path mention beats a stronger lexical match elsewhere.
    const lit = locate(idx, 'slugify breaks; traceback at utils/strings.js:2 and `trim`');
    assert.equal(lit.files[0].path, 'utils/strings.js');
    assert.ok(lit.files.some(f => f.path === 'util/readme.md'));

    const viaLocalize = await localize(root, '`InvoiceBuilder` crashes');
    assert.equal(viaLocalize.files[0].path, 'billing/invoice.py');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('snippet returns numbered lines around the symbol line', async () => {
  const root = await fixture();
  try {
    const s = snippet(join(root, 'billing/invoice.py'), 6, 1);
    assert.equal(s, '5: \n6: def compute_total(items):\n7:     return sum(items)');
    assert.match(snippet(join(root, 'billing/invoice.py'), 0, 2), /^1: import os/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
