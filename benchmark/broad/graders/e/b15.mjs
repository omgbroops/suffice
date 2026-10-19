import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {globby, globbySync, globbyStream, isGitIgnored, isGitIgnoredSync} = await import(pathToFileURL(path.resolve('index.js')));
const cwd = await fs.mkdtemp(path.resolve('.broad-b15-fixture-'));
try {
 const files = ['outside.log', 'dir/top.log', 'dir/deep/child.log', 'dir/deep/further/end.log', 'dir/top.txt', 'dir/deep/top.txt', 'dir/anchored.tmp', 'dir/deep/anchored.tmp', 'dir/deep/leaf.tmp', 'dir/deep/further/leaf.tmp', 'dir/deep/keep.log'];
 for (const file of files) {const p=path.join(cwd,file);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,'');}
 await fs.writeFile(path.join(cwd,'dir/.gitignore'), '*.log\ntop.txt\n/anchored.tmp\ndeep/*.tmp\n!keep.log\n');
 const checks = [['outside.log',false],['dir/top.log',true],['dir/deep/child.log',true],['dir/deep/further/end.log',true],['dir/top.txt',true],['dir/deep/top.txt',true],['dir/anchored.tmp',true],['dir/deep/anchored.tmp',true],['dir/deep/leaf.tmp',true],['dir/deep/further/leaf.tmp',false],['dir/deep/keep.log',false]];
 for (const predicate of [await isGitIgnored({cwd}), isGitIgnoredSync({cwd})]) {
  for (const [file,expected] of checks) assert.equal(predicate(file),expected,file);
 }
 const expected = ['dir/deep/further/leaf.tmp','dir/deep/keep.log','outside.log'].sort();
 const options = {cwd,gitignore:true};
 assert.deepEqual((await globby('**/*',options)).sort(),expected);
 assert.deepEqual(globbySync('**/*',options).sort(),expected);
 const streamed=[];for await (const file of globbyStream('**/*',options)) streamed.push(file);
 assert.deepEqual(streamed.sort(),expected);
 assert.deepEqual((await globby('**/*.log',{cwd,gitignore:false})).sort(),files.filter(x=>x.endsWith('.log')).sort());
 console.log('b15: 26 behavioral assertions passed');
} finally {await fs.rm(cwd,{recursive:true,force:true});}
