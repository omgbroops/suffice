const assert = require('node:assert/strict');
const mm = require(process.cwd());
const files = ['C:\\jobs\\report.xml', 'C:\\jobs\\readme.txt', 'D:\\more\\item.xml'];
for (const option of ['basename', 'matchBase']) {
 const options = {[option]: true, unixify: true};
 assert.deepEqual(mm.not(files, ['*.xml'], options), ['C:/jobs/readme.txt']);
 assert.deepEqual(mm.not(files, ['*.txt'], options), ['C:/jobs/report.xml', 'D:/more/item.xml']);
 assert.deepEqual(mm.not(files, ['*.xml', '*.txt'], options), []);
 assert.deepEqual(mm.not(files, ['*.unknown'], options), files.map(x => x.replace(/\\/g, '/')));
 assert.deepEqual(files, ['C:\\jobs\\report.xml', 'C:\\jobs\\readme.txt', 'D:\\more\\item.xml']);
}
assert.deepEqual(mm.not(files, ['**/*.xml'], {unixify:true}), ['C:/jobs/readme.txt']);
assert.deepEqual(mm.not(['./src/a.js', './src/b.txt'], ['**/*.js']), ['src/b.txt']);
assert.deepEqual(mm.not(['a.js', 'b.txt', 'b.txt'], '*.js'), ['b.txt']);
assert.deepEqual(mm.not(['a.js', 'b.txt', 'b.txt'], '*.js', {nodupes:false}), ['b.txt', 'b.txt']);
console.log('b14: 14 behavioral assertions passed');
