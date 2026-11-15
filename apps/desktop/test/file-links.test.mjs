import test from 'node:test';
import assert from 'node:assert/strict';
import {fileLinkPath} from '../src/file-links.js';
test('transcript file links preserve relative and outside paths without treating web links as files',()=>{
 for(const [href,path] of [['apps/desktop/README.md','apps/desktop/README.md'],['../outside.js#L12','../outside.js'],['C:/outside/file.js:12:2','C:/outside/file.js'],['C:%5Coutside%5Cfile.js','C:\\outside\\file.js'],['file:///C:/Users/test%20file.js','C:/Users/test file.js'],['file:///Users/test.js','/Users/test.js']])assert.equal(fileLinkPath(href),path);
 for(const href of ['https://example.com','mailto:test@example.com','javascript:alert(1)','#section','//example.com/file'])assert.equal(fileLinkPath(href),null);
});
