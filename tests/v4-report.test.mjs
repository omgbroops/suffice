import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { report, parseRows, wilson } from '../scripts/v4-report.mjs';

const rows = parseRows(readFileSync(resolve(import.meta.dirname, 'fixtures/v4-report-rows.jsonl'), 'utf8'));

test('wilson 95% interval matches the known value for 5/10 and is null for n=0', () => {
  const [lo, hi] = wilson(5, 10);
  assert.ok(Math.abs(lo - 0.2366) < 1e-3 && Math.abs(hi - 0.7634) < 1e-3);
  assert.equal(wilson(0, 0), null);
});

test('report has benchmark, difficulty and arm tables with n and contaminated label', () => {
  const md = report(rows);
  assert.match(md, /## By benchmark/);
  assert.match(md, /## By difficulty/);
  assert.match(md, /## By arm/);
  assert.match(md, /polyglot \(public, contaminated\) \| 2 \|/);
  assert.match(md, /\| single:claude-opus-5-5 \| 2 \|/);
  assert.match(md, /\| v4 \| 4 \| 1\/4 25\.0% .* \| 2\/4 50\.0% .* \| \$0\.0300 \|/); // first-round cost 0.03 over 1 first pass is 0.03 per first pass
});

test('non-success statuses are counted by name and unknown cost is shown', () => {
  const md = report(rows);
  assert.match(md, /provider_error: 1/);
  assert.match(md, /run_timeout: 1/);
  assert.match(md, /\| single:claude-opus-5-5 \| 2 \|.*\| 1 \|$/m);
});
