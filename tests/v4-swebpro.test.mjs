import test from 'node:test';
import assert from 'node:assert/strict';
import provider, { buildEntryScript, classify, judge, lastLines, patchFiles } from '../src/v4-swebpro.mjs';

const row = {
  base_commit: 'abc123',
  selected_test_files_to_run: '["TestA", "TestB"]',
  before_repo_set_cmd: 'git reset --hard abc123\ngit clean -fd\ngit checkout abc123\ngit apply --verbose /tests/test_patch.patch',
  fail_to_pass: '["TestA"]',
  pass_to_pass: '["TestB"]',
};

test('judge passes only when every F2P and P2P name is PASSED', () => {
  const out = { tests: [{ name: 'TestA', status: 'PASSED' }, { name: 'TestB', status: 'PASSED' }] };
  assert.equal(judge(out, ['TestA'], ['TestB']), true);
  assert.equal(judge({ tests: [{ name: 'TestA', status: 'FAILED' }, { name: 'TestB', status: 'PASSED' }] }, ['TestA'], ['TestB']), false);
  assert.equal(judge({ tests: [{ name: 'TestA', status: 'PASSED' }] }, ['TestA'], ['TestB']), false);
  assert.equal(judge({ tests: [] }, [], []), true);
});

test('patchFiles reads paths from diff headers', () => {
  const p = 'diff --git a/x/a.go b/x/a.go\nindex 1..2\n@@\ndiff --git a/new.go b/new.go\nnew file mode 100644\n';
  assert.deepEqual(patchFiles(p), ['x/a.go', 'new.go']);
});

test('buildEntryScript mirrors the eval order and points at workspace files', () => {
  const s = buildEntryScript(row);
  assert.match(s, /git reset --hard abc123/);
  assert.match(s, /git apply -v \/workspace\/patch\.diff \|\| \{ echo PATCH_APPLY_FAILED; exit 97; \}/);
  assert.match(s, /git apply --verbose \/workspace\/test_patch\.patch/);
  assert.doesNotMatch(s, /\/tests\/test_patch/);
  assert.match(s, /run_script\.sh TestA,TestB /);
  assert.ok(s.indexOf('patch.diff') < s.indexOf('test_patch.patch'));
});

test('classify maps markers, missing output, timeouts and verdicts', () => {
  const base = { row, dockerOut: '', hasOutput: false, output: null, timedOut: false };
  assert.equal(classify({ ...base, timedOut: true }), 'timeout');
  assert.equal(classify({ ...base, dockerOut: 'PATCH_APPLY_FAILED' }), 'patch_apply_failed');
  assert.equal(classify({ ...base, dockerOut: 'TEST_PATCH_APPLY_FAILED' }), 'patch_apply_failed');
  assert.equal(classify(base), 'infra_error');
  const ok = { tests: [{ name: 'TestA', status: 'PASSED' }, { name: 'TestB', status: 'PASSED' }] };
  assert.equal(classify({ ...base, hasOutput: true, output: ok }), 'pass');
  assert.equal(classify({ ...base, hasOutput: true, output: { tests: [] } }), 'test_fail');
});

test('lastLines keeps the tail only', () => {
  const text = Array.from({ length: 100 }, (_, i) => `l${i}`).join('\n');
  assert.equal(lastLines(text, 2), 'l98\nl99');
});

test('provider exports the bench interface', () => {
  assert.equal(typeof provider.prepWorkspace, 'function');
  assert.equal(typeof provider.runAcceptance, 'function');
});
