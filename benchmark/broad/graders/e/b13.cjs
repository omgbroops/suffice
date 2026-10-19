const assert = require('node:assert/strict');
const mm = require(process.cwd());
for (const option of ['matchBase', 'basename']) {
  for (const [name, extension] of [['widget.js', 'js'], ['report.xml', 'xml'], ['notes.md', 'md']]) {
    const filepath = `./alpha/beta/${name}`;
    const options = {[option]: true};
    assert.equal(mm.isMatch(filepath, `*.${extension}`, options), true);
    assert.equal(mm.isMatch(filepath, `!*.${extension}`, options), false);
    assert.equal(mm.matcher(`!*.${extension}`, options)(filepath), false);
    assert.equal(mm.isMatch(filepath, '!*.unrelated', options), true);
  }
}
assert.equal(mm.isMatch('./x/y.js', '**/*.js', {matchBase: true}), true);
assert.equal(mm.isMatch('./x/y.js', '!**/*.js', {matchBase: true}), false);
assert.equal(mm.isMatch('src/a.js', '*.js'), false);
console.log('b13: 27 behavioral assertions passed');
