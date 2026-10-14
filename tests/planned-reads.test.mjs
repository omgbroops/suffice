import test from 'node:test';
import assert from 'node:assert/strict';
import { plannedReads } from '../src/planned-reads.mjs';
test('identifies explicit upcoming reads in a tool program', () => {
  assert.deepEqual([...plannedReads(`text(await tools.file_read({path:"src/a.mjs"})); text(await tools.file_read({ path: 'src/b.mjs', limit: 20 }));`)], ['src/a.mjs', 'src/b.mjs']);
});
test('identifies a literal batch loop while leaving dynamic reads undecided', () => {
  assert.deepEqual([...plannedReads(`for (const path of ["src/a.mjs", "src/b.mjs"]) text(await tools.file_read({path}));`)], ['src/a.mjs', 'src/b.mjs']);
  assert.deepEqual([...plannedReads(`for (const path of paths) text(await tools.file_read({path}));`)], []);
  assert.deepEqual([...plannedReads(`text(await tools.file_read({path: computePath()}));`)], []);
});
test('does not treat an edit or unrelated string list as a planned read', () => {
  assert.deepEqual([...plannedReads(`tools.file_edit({path:"src/a.mjs",oldText:"x",newText:"y"});`)], []);
  assert.deepEqual([...plannedReads(`for(const path of ["src/a.mjs"]) text(path);`)], []);
});
