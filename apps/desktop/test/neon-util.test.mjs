import test from 'node:test';
import assert from 'node:assert/strict';
import { esc, ago, shortTime, stateOf, matchesQuery } from '../src/backgrounds/neon-util.js';

test('esc uses numeric entities and tolerates null', () => {
  assert.equal(esc('<a href="x">&\'</a>'), '&#60;a href=&#34;x&#34;&#62;&#38;&#39;&#60;/a&#62;');
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(5), '5');
});

test('ago buckets minutes, hours, days, weeks, months', () => {
  const at = m => Date.now() - m * 60000;
  assert.equal(ago(at(5)), '5m');
  assert.equal(ago(at(120)), '2h');
  assert.equal(ago(at(60 * 24 * 3)), '3d');
  assert.equal(ago(at(60 * 24 * 14)), '2w');
  assert.equal(ago(at(60 * 24 * 90)), '3mo');
  assert.equal(ago(Date.now() + 1e6), '0m');
});

test('shortTime reads Suffice row labels', () => {
  assert.equal(shortTime('3 days ago'), '3d');
  assert.equal(shortTime('2 months ago'), '2mo');
  assert.equal(shortTime('1 hour ago'), '1h');
  assert.equal(shortTime('yesterday'), '1d');
  assert.equal(shortTime('last week'), '1w');
  assert.equal(shortTime(''), '');
});

test('stateOf and matchesQuery', () => {
  assert.equal(stateOf({ state: 'OPEN' }), 'open');
  assert.equal(stateOf(null), '');
  assert.ok(matchesQuery({ number: 12, title: 'Fix Bug' }, 'bug'));
  assert.ok(matchesQuery({ number: 12, title: 'x' }, '12'));
  assert.ok(!matchesQuery({ number: 12, title: 'x' }, 'zzz'));
  assert.ok(matchesQuery({ number: 1, title: 'x' }, ''));
});
