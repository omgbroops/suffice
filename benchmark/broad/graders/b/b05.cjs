'use strict';
const assert = require('node:assert/strict');
const qs = require(process.cwd());
let passed = 0, failed = 0;
function check(name, fn) { try { fn(); passed++; } catch (e) { failed++; console.error(name + ': ' + e.message); } }
check('reported comma object', () => assert.deepEqual(qs.parse({ color: 'a,b' }, { comma: true }), { color: ['a', 'b'] }));
check('several values', () => assert.deepEqual(qs.parse({ tags: 'red,green,blue' }, { comma: true }), { tags: ['red', 'green', 'blue'] }));
check('nested path', () => assert.deepEqual(qs.parse({ 'filter[color]': 'red,blue' }, { comma: true }), { filter: { color: ['red', 'blue'] } }));
check('independent fields', () => assert.deepEqual(qs.parse({ a: '1,2', b: '3,4' }, { comma: true }), { a: ['1', '2'], b: ['3', '4'] }));
check('missing comma stays scalar', () => assert.deepEqual(qs.parse({ color: 'red' }, { comma: true }), { color: 'red' }));
check('empty value preserved', () => assert.deepEqual(qs.parse({ color: '' }, { comma: true }), { color: '' }));
check('default does not split', () => assert.deepEqual(qs.parse({ color: 'a,b' }), { color: 'a,b' }));
check('false option does not split', () => assert.deepEqual(qs.parse({ color: 'a,b' }, { comma: false }), { color: 'a,b' }));
check('string input still splits', () => assert.deepEqual(qs.parse('color=a,b', { comma: true }), { color: ['a', 'b'] }));
check('nonstring primitive preserved', () => assert.deepEqual(qs.parse({ count: 7, ready: true }, { comma: true }), { count: 7, ready: true }));
check('input not mutated', () => { const input = { color: 'a,b' }; qs.parse(input, { comma: true }); assert.deepEqual(input, { color: 'a,b' }); });
console.log(JSON.stringify({ passed, failed }));
if (failed) process.exitCode = 1;
