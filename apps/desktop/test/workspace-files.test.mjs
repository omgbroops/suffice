import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import files from '../electron/workspace-files.cjs';
const exec=promisify(execFile);

test('ignored filtering checks only the requested entries and keeps tracked exceptions',async()=>{
 const root=await mkdtemp(resolve(tmpdir(),'suffice-ignore-filter-')),git=args=>exec('git',['-C',root,...args],{windowsHide:true});await git(['init','-q']);
 await writeFile(resolve(root,'.gitignore'),'ignored/\n*.log\n');await mkdir(resolve(root,'ignored'));await mkdir(resolve(root,'visible'));await writeFile(resolve(root,'keep.log'),'tracked\n');await git(['add','-f','keep.log']);await writeFile(resolve(root,'skip.log'),'ignored\n');await writeFile(resolve(root,'visible','nested.log'),'ignored\n');await writeFile(resolve(root,'visible','keep.txt'),'keep\n');
 const listed=(await files.list(root)).entries,filtered=await files.filterIgnored(root,listed);assert.ok(!filtered.some(entry=>entry.path==='ignored'||entry.path==='skip.log'));assert.ok(filtered.some(entry=>entry.path==='keep.log'));assert.ok(filtered.some(entry=>entry.path==='visible'));
 const nested=await files.filterIgnored(root,(await files.list(root,'visible')).entries);assert.deepEqual(nested.map(entry=>entry.path),['visible/keep.txt']);assert.deepEqual(await files.filterIgnored(root,[]),[]);
 const outside=await mkdtemp(resolve(tmpdir(),'suffice-ignore-no-git-'));assert.deepEqual(await files.filterIgnored(outside,listed),listed);
});
test('workspace browsing rejects escapes and shows real tracked, renamed and untracked changes',async()=>{
 const root=await mkdtemp(resolve(tmpdir(),'suffice-files-')),outside=await mkdtemp(resolve(tmpdir(),'suffice-outside-'));
 await writeFile(resolve(root,'hello.txt'),'before\n');await writeFile(resolve(root,'old name.txt'),'rename fixture\n');await mkdir(resolve(root,'folder'));
 const git=args=>exec('git',['-C',root,...args],{windowsHide:true});
 await git(['init','-q']);await git(['add','hello.txt','old name.txt']);await git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture']);
 await writeFile(resolve(root,'hello.txt'),'after\n');await writeFile(resolve(root,'new.txt'),'new file\n');await git(['mv','old name.txt','renamed name.txt']);
 await symlink(outside,resolve(root,'escape'),process.platform==='win32'?'junction':'dir');
 const entries=(await files.list(root)).entries;assert.equal(entries[0].kind,'directory');assert.ok(!entries.some(entry=>entry.name==='.git'));
 assert.equal((await files.read(root,'hello.txt')).text,'after\n');
 await assert.rejects(files.read(root,resolve(outside,'secret.txt')),/Invalid workspace path/);
 await assert.rejects(files.list(root,'escape'),/outside this project/);
 const changes=await files.changes(root);assert.ok(changes.entries.some(entry=>entry.path==='new.txt'&&entry.status==='??'));
 assert.deepEqual([changes.entries.find(entry=>entry.path==='hello.txt').added,changes.entries.find(entry=>entry.path==='hello.txt').removed],[1,1]);assert.equal(changes.entries.find(entry=>entry.path==='new.txt').added,1);
 assert.ok(changes.entries.some(entry=>entry.path==='renamed name.txt'&&entry.from==='old name.txt'));
 assert.match((await files.diff(root,'hello.txt')).text,/\+after/);
 assert.match((await files.diff(root,'new.txt')).text,/new file/);
 assert.equal((await files.changes(outside)).git,false);
});

test('change counts describe net edits, renames, binary files and unborn repositories',async()=>{
 const root=await mkdtemp(resolve(tmpdir(),'suffice-diff-stats-')),git=args=>exec('git',['-C',root,...args],{windowsHide:true});await git(['init','-q']);await writeFile(resolve(root,'initial.txt'),'initial\n');await git(['add','initial.txt']);assert.equal((await files.changes(root)).entries.find(entry=>entry.path==='initial.txt').added,1);await git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture']);
 await writeFile(resolve(root,'initial.txt'),'staged\n');await git(['add','initial.txt']);await writeFile(resolve(root,'initial.txt'),'final\n');await writeFile(resolve(root,'image.dat'),Buffer.from([0,1,2]));const entries=(await files.changes(root)).entries;const modified=entries.find(entry=>entry.path==='initial.txt');assert.deepEqual([modified.added,modified.removed],[1,1]);assert.equal(entries.find(entry=>entry.path==='image.dat').binary,true);const diff=await files.diff(root,'initial.txt');assert.match(diff.text,/-initial/);assert.doesNotMatch(diff.text,/staged/);
 const renamed=files.parseNumstat('0\t0\t\0old name.ts\0new name.ts\0-\t-\timage.png\0');assert.deepEqual(renamed.get('new name.ts'),{added:0,removed:0,binary:false});assert.equal(renamed.get('image.png').binary,true);
});

test('explicit linked previews can read outside the project while tree browsing stays scoped',async()=>{
 const root=await mkdtemp(resolve(tmpdir(),'suffice-preview-root-')),outside=await mkdtemp(resolve(tmpdir(),'suffice-preview-outside-')),file=resolve(outside,'linked.txt');await writeFile(file,'external linked file');
 await assert.rejects(files.read(root,file));assert.equal((await files.read(root,file,{external:true})).text,'external linked file');await assert.rejects(files.list(root,file));
});
