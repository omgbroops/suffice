'use strict';
const assert = require('node:assert/strict');
const mm = require(process.cwd());
let passed = 0, failed = 0;
function check(name, fn) { try { fn(); passed++; } catch (e) { failed++; console.error(name + ': ' + e.message); } }
function match(pattern, path, expected, options) { const re = mm.makeRe(pattern, options); assert.ok(re instanceof RegExp); assert.equal(re.test(path), expected); }
check('reported zero directories', () => match('/path/**/*.html', '/path/page.html', true));
check('reported one directory', () => match('/path/**/*.html', '/path/to/page.html', true));
check('reported two directories', () => match('/path/**/*.html', '/path/to/web/page.html', true));
check('relative zero directories', () => match('docs/**/*.md', 'docs/readme.md', true));
check('leading globstar zero directories', () => match('**/*.json', 'package.json', true));
check('leading globstar several directories', () => match('**/*.json', 'a/b/package.json', true));
check('adjacent globstars zero directories', () => match('docs/**/**/*.md', 'docs/readme.md', true));
check('wrong extension rejected', () => match('/path/**/*.html', '/path/page.txt', false));
check('hidden file rejected by default', () => match('/path/**/*.html', '/path/.secret.html', false));
// The historical implementation and reference both match a hidden directory
// here. That separate makeRe limitation is outside issue #157's contract.
check('dot option permits hidden path', () => match('/path/**/*.html', '/path/.hidden/page.html', true, { dot: true }));
check('nocase option retained', () => match('docs/**/*.md', 'DOCS/README.MD', true, { nocase: true }));
check('noglobstar requires its path portion', () => match('docs/**/*.md', 'docs/readme.md', false, { noglobstar: true }));
console.log(JSON.stringify({ passed, failed }));
if (failed) process.exitCode = 1;
