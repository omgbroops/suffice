import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const {default: stringWidth} = await import(pathToFileURL(path.join(process.cwd(), 'index.js')));
const outcomes = [];
function check(name, fn) { try { fn(); outcomes.push({name, passed: true}); } catch (error) { outcomes.push({name, passed: false, error: error.message}); } }
for (const codePoint of [0x600, 0x601, 0x602, 0x603, 0x604, 0x605, 0x6DD, 0x70F, 0x890, 0x891, 0x8E2, 0x110BD, 0x110CD]) {
  const char = String.fromCodePoint(codePoint);
  check(`format U+${codePoint.toString(16)} has zero columns`, () => assert.equal(stringWidth(char), 0));
}
check('Arabic digits with format prefix', () => assert.equal(stringWidth('\u0600\u0661\u0662\u0663'), 3));
check('mixed Latin and format characters', () => assert.equal(stringWidth('x\u06DDy\u070Fz'), 3));
check('all-format text', () => assert.equal(stringWidth('\u0600\u06DD\u070F'), 0));
check('ASCII width remains supported', () => assert.equal(stringWidth('plain'), 5));
check('CJK width remains supported', () => assert.equal(stringWidth('古'), 2));
check('ANSI codes remain ignored by default', () => assert.equal(stringWidth('\u001B[1m古\u001B[22m'), 2));
check('format-only text with countAnsiEscapeCodes', () => assert.equal(stringWidth('\u0600', {countAnsiEscapeCodes:true}), 0));
check('empty input remains zero', () => assert.equal(stringWidth(''), 0));
console.log(JSON.stringify({total: outcomes.length, passed: outcomes.filter(x => x.passed).length, outcomes}));
if (outcomes.some(x => !x.passed)) process.exitCode = 1;
