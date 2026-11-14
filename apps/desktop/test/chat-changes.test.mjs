import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {projectMetadata} from '../electron/sidebar-metadata.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createChatChangeTracker,readChatChanges} from '../electron/chat-changes.mjs';
import {repositoryTools} from '../../../packages/cli/src/tools.mjs';
const id='a'.repeat(32),secondId='b'.repeat(32);
const fixture=async()=>{const cwd=await mkdtemp(resolve(tmpdir(),'suffice-changes-'));return {cwd,home:await mkdtemp(resolve(tmpdir(),'suffice-change-home-'))};};

test('workspace directory aliases produce complete receipts and share conflict identity',async()=>{
 const {cwd,home}=await fixture(),aliases=await mkdtemp(resolve(tmpdir(),'suffice-alias-')),alias=resolve(aliases,'workspace');
 await symlink(cwd,alias,process.platform==='win32'?'junction':'dir');
 await writeFile(resolve(cwd,'file.txt'),'before\n');
 const throughAlias=createChatChangeTracker({cwd:alias,home,getId:()=>id});
 let token=await throughAlias.before('edit',{path:'file.txt'});await writeFile(resolve(alias,'file.txt'),'after\n');await throughAlias.after(token);
 assert.deepEqual(await readChatChanges(home,id),{added:1,removed:1,files:1,partial:false,scope:'chat'});
 const canonical=createChatChangeTracker({cwd,home,getId:()=>secondId});
 token=await throughAlias.before('edit',{path:resolve(cwd,'file.txt')});const other=await canonical.before('edit',{path:'file.txt'});
 await writeFile(resolve(cwd,'file.txt'),'overlap\n');await throughAlias.after(token);await canonical.after(other);
 assert.equal((await readChatChanges(home,id)).partial,true);assert.equal((await readChatChanges(home,secondId)).partial,true);
});

test('canonical workspace containment still excludes directory links escaping the root',async()=>{
 const {cwd,home}=await fixture(),outside=await mkdtemp(resolve(tmpdir(),'suffice-outside-'));
 await writeFile(resolve(outside,'file.txt'),'before\n');await symlink(outside,resolve(cwd,'escape'),process.platform==='win32'?'junction':'dir');
 const tracker=createChatChangeTracker({cwd,home,getId:()=>id}),token=await tracker.before('edit',{path:'escape/file.txt'});
 await writeFile(resolve(outside,'file.txt'),'after\n');await tracker.after(token);
 assert.deepEqual(await readChatChanges(home,id),{added:0,removed:0,files:0,partial:true,scope:'chat'});
});
test('chat receipts exclude existing dirt, compose net edits, persist and isolate threads',async()=>{
 const {cwd,home}=await fixture();await writeFile(resolve(cwd,'a.txt'),'preexisting dirty line\nkeep\n');const tracker=createChatChangeTracker({cwd,home,getId:()=>id});const tools=repositoryTools({workspace:cwd,toolObserver:tracker});const write=tools.find(t=>t.name==='write');
 await write.execute('1',{path:'a.txt',content:'preexisting dirty line\nkeep\nnew\n'},undefined,()=>{});assert.deepEqual(await readChatChanges(home,id),{added:1,removed:0,files:1,partial:false,scope:'chat'});
 const resumed=createChatChangeTracker({cwd,home,getId:()=>id});const token=await resumed.before('edit',{path:'a.txt'});await writeFile(resolve(cwd,'a.txt'),'preexisting dirty line\nkeep\n');await resumed.after(token);assert.equal((await readChatChanges(home,id)).added,0);
 const other=createChatChangeTracker({cwd,home,getId:()=>secondId});const second=await other.before('write',{path:'b.txt'});await writeFile(resolve(cwd,'b.txt'),'other thread\n');await other.after(second);assert.equal((await readChatChanges(home,secondId)).added,1);assert.equal((await readChatChanges(home,id)).added,0);assert.equal(await readChatChanges(home,'c'.repeat(32)),null);
});
test('shell snapshots include new and deleted text files without requiring git',async()=>{
 const {cwd,home}=await fixture();await writeFile(resolve(cwd,'old.txt'),'old\n');const tracker=createChatChangeTracker({cwd,home,getId:()=>id});const token=await tracker.before('bash',{});await rm(resolve(cwd,'old.txt'));await writeFile(resolve(cwd,'new.txt'),'one\ntwo\n');await tracker.after(token);assert.deepEqual(await readChatChanges(home,id),{added:2,removed:1,files:2,partial:false,scope:'chat'});
});
test('overlapping tools never claim a shared file as confidently attributed',async()=>{
 const {cwd,home}=await fixture();await writeFile(resolve(cwd,'shared'),'before\n');const a=createChatChangeTracker({cwd,home,getId:()=>id}),b=createChatChangeTracker({cwd,home,getId:()=>secondId});const first=await a.before('write',{path:'shared'}),second=await b.before('write',{path:'shared'});await writeFile(resolve(cwd,'shared'),'after\n');await a.after(first);await b.after(second);for(const key of [id,secondId]){const result=await readChatChanges(home,key);assert.equal(result.partial,true);assert.equal(result.added,0);}
});
test('an external intervening change makes further shared-file attribution partial',async()=>{
 const {cwd,home}=await fixture();await writeFile(resolve(cwd,'file'),'a\n');const tracker=createChatChangeTracker({cwd,home,getId:()=>id});let token=await tracker.before('edit',{path:'file'});await writeFile(resolve(cwd,'file'),'a\nb\n');await tracker.after(token);await writeFile(resolve(cwd,'file'),'external\n');token=await tracker.before('edit',{path:'file'});await writeFile(resolve(cwd,'file'),'external\nc\n');await tracker.after(token);assert.equal((await readChatChanges(home,id)).partial,true);assert.equal((await readChatChanges(home,id)).files,0);
});

test('separate background processes detect overlapping workspace operations',{timeout:15000},async()=>{
 const {cwd,home}=await fixture();await writeFile(resolve(cwd,'shared'),'before\n');const parent=createChatChangeTracker({cwd,home,getId:()=>id});const first=await parent.before('edit',{path:'shared'});
 const url=pathToFileURL(resolve('apps/desktop/electron/chat-changes.mjs')).href;
 const code=`import {createChatChangeTracker} from ${JSON.stringify(url)};import {writeFile} from 'node:fs/promises';const tracker=createChatChangeTracker({cwd:${JSON.stringify(cwd)},home:${JSON.stringify(home)},getId:()=>${JSON.stringify(secondId)}});const token=await tracker.before('edit',{path:'shared'});await writeFile(${JSON.stringify(resolve(cwd,'shared'))},'background\\n');await tracker.after(token);`;
 const child=spawn(process.execPath,['--input-type=module','-e',code],{windowsHide:true,stdio:['ignore','pipe','pipe']});let errors='';child.stderr.on('data',chunk=>errors+=chunk);const [exit]=await once(child,'exit');assert.equal(exit,0,errors);await parent.after(first);assert.equal((await readChatChanges(home,id)).partial,true);assert.equal((await readChatChanges(home,secondId)).partial,true);
});
test('project totals compare the feature branch to main, including uncommitted edits',async()=>{
 const {cwd}=await fixture(),exec=promisify(execFile),git=(...args)=>exec('git',['-C',cwd,...args],{windowsHide:true});await git('init','-b','main');await git('config','user.name','Fixture');await git('config','user.email','fixture@example.invalid');await writeFile(resolve(cwd,'file'),'original\n');await git('add','file');await git('commit','-m','base');await git('checkout','-b','feature');await writeFile(resolve(cwd,'file'),'replacement\n');await git('add','file');await git('commit','-m','feature');await writeFile(resolve(cwd,'file'),'replacement\nworking\n');const metadata=await projectMetadata(cwd);assert.equal(metadata.projectDiff.scope,'branch');assert.equal(metadata.projectDiff.added,2);assert.equal(metadata.projectDiff.removed,1);
});
