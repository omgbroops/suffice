'use strict';
const assert = require('node:assert/strict');
const qs = require(process.cwd());
let passed = 0, failed = 0;
function check(name, fn) { try { fn(); passed++; } catch (e) { failed++; console.error(name + ': ' + e.message); } }
const options = { strictNullHandling: true, allowEmptyArrays: true };
check('reported empty array', () => assert.deepEqual(qs.parse('testEmptyArray[]', options), { testEmptyArray: [] }));
check('different empty key', () => assert.deepEqual(qs.parse('items[]', options), { items: [] }));
check('nested empty array', () => assert.deepEqual(qs.parse('config[items][]', options), { config: { items: [] } }));
check('two independent arrays', () => assert.deepEqual(qs.parse('alpha[]&beta[]', options), { alpha: [], beta: [] }));
check('encoded brackets', () => assert.deepEqual(qs.parse('items%5B%5D', options), { items: [] }));
check('scalar null preserved', () => assert.deepEqual(qs.parse('value', options), { value: null }));
check('nonempty array preserved', () => assert.deepEqual(qs.parse('items[]=one&items[]=two', options), { items: ['one', 'two'] }));
check('opt out preserves null entry', () => assert.deepEqual(qs.parse('items[]', { strictNullHandling: true }), { items: [null] }));
check('equals still denotes empty array', () => assert.deepEqual(qs.parse('items[]=', options), { items: [] }));
check('stringify parse round trip', () => { const value = { empty: [], nested: { values: [] }, present: ['x'] }; assert.deepEqual(qs.parse(qs.stringify(value, options), options), value); });
console.log(JSON.stringify({ passed, failed }));
if (failed) process.exitCode = 1;
