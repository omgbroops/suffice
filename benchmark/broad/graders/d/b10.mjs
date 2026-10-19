import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const {default: ansiRegex} = await import(pathToFileURL(path.join(process.cwd(), 'index.js')));
const outcomes = [];
function check(name, fn) { try { fn(); outcomes.push({name, passed: true}); } catch (error) { outcomes.push({name, passed: false, error: error.message}); } }
for (const code of ['\u001Bs', '\u001Bu', '\u001B[s', '\u001B[u']) {
  check(`match complete cursor sequence ${JSON.stringify(code)}`, () => assert.deepEqual(`left${code}right`.match(ansiRegex()), [code]));
  check(`preserve text after cursor sequence ${JSON.stringify(code)}`, () => assert.equal(`left${code}right`.replace(ansiRegex(), ''), 'leftright'));
}
check('save restore pair preserves intervening text', () => assert.equal('\u001Bshello\u001Buworld'.replace(ansiRegex(), ''), 'helloworld'));
check('onlyFirst preserves second match', () => assert.deepEqual(Array.from('\u001Bsone\u001Butwo'.match(ansiRegex({onlyFirst:true})) ?? []), ['\u001Bs']));
check('styling still works', () => assert.equal('\u001B[31mred\u001B[0m'.replace(ansiRegex(), ''), 'red'));
check('plain s and u are not stripped', () => assert.equal('sun sunrise'.replace(ansiRegex(), ''), 'sun sunrise'));
check('plain string has no matches', () => assert.equal('ordinary'.match(ansiRegex()), null));
console.log(JSON.stringify({total: outcomes.length, passed: outcomes.filter(x => x.passed).length, outcomes}));
if (outcomes.some(x => !x.passed)) process.exitCode = 1;
