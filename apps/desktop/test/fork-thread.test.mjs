import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {resolve} from 'node:path';
import {forkSavedThread} from '../electron/fork-thread.mjs';import {createThreadStore,threadId} from '../electron/threads.mjs';
test('a desktop fork keeps messages, gives a new identity and never changes its source',async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-fork-')),dir=resolve(home,'sessions','fixture'),cwd=resolve(home,'new-project');await mkdir(dir,{recursive:true});await mkdir(cwd);const path=resolve(dir,'source.jsonl'),timestamp=new Date().toISOString(),source=[{type:'session',version:3,id:'source',timestamp,cwd:resolve(home,'missing-folder')},{type:'message',id:'user',parentId:null,timestamp,message:{role:'user',content:[{type:'text',text:'Original conversation'}],timestamp:Date.now()}}].map(JSON.stringify).join('\n')+'\n';await writeFile(path,source);
 const fork=await forkSavedThread({sourcePath:path,cwd,home,title:'Original'});assert.notEqual(fork.id,threadId(path));assert.equal(await readFile(path,'utf8'),source);const header=JSON.parse((await readFile(fork.path,'utf8')).split('\n')[0]);assert.equal(header.parentSession,path);assert.equal(header.cwd,cwd);const store=createThreadStore(home);await store.list();const view=await store.open(fork.id);assert.equal(view.messages[0].content[0].text,'Original conversation');
 await assert.rejects(forkSavedThread({sourcePath:resolve(home,'outside.jsonl'),cwd,home}),/ENOENT/);
});
