import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const {default: ansiRegex} = await import(pathToFileURL(path.join(process.cwd(), 'index.js')));
const outcomes = [];
function check(name, fn) { try { fn(); outcomes.push({name, passed: true}); } catch (error) { outcomes.push({name, passed: false, error: error.message}); } }
for (const [name, terminator] of [['BEL', '\u0007'], ['ESC-ST', '\u001B\\'], ['C1-ST', '\u009C']]) {
  const open = `\u001B]8;;https://example.org/path${terminator}`;
  const close = `\u001B]8;;${terminator}`;
  check(`${name} matches complete OSC8 boundaries`, () => assert.deepEqual(`prefix${open}caption${close}suffix`.match(ansiRegex()), [open, close]));
  check(`${name} strips metadata but keeps caption`, () => assert.equal(`before${open}visible${close}after`.replace(ansiRegex(), ''), 'beforevisibleafter'));
  check(`${name} onlyFirst matches opening boundary`, () => assert.deepEqual(Array.from(`${open}caption${close}`.match(ansiRegex({onlyFirst: true})) ?? []), [open]));
  const parameterized = `\u001B]8;id=part-7;mailto:user@example.org${terminator}`;
  check(`${name} preserves parameterized link label`, () => assert.equal(`${parameterized}mail${close}!`.replace(ansiRegex(), ''), 'mail!'));
}
check('styling remains supported', () => assert.equal('\u001B[1mbold\u001B[0m'.replace(ansiRegex(), ''), 'bold'));
check('ordinary backslashes remain literal', () => assert.equal('folder\\file'.replace(ansiRegex(), ''), 'folder\\file'));
console.log(JSON.stringify({total: outcomes.length, passed: outcomes.filter(x => x.passed).length, outcomes}));
if (outcomes.some(x => !x.passed)) process.exitCode = 1;
