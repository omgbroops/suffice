import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
const {createFileOpeners,targetPath}=createRequire(import.meta.url)('../electron/file-openers.cjs');
test('file openers validate project paths and dispatch default app and reveal',async()=>{
 const root=await mkdtemp(resolve(tmpdir(),'suffice-openers-')),file=resolve(root,'file.txt');await writeFile(file,'fixture');
 assert.equal(await targetPath(root,'file.txt'),file);await assert.rejects(targetPath(root,'../'),/outside/);
 const calls=[],openers=createFileOpeners({app:{getFileIcon:async()=>({toDataURL:()=> 'data:image/png;base64,fixture'})},shell:{openPath:async path=>{calls.push(['default',path]);return '';},showItemInFolder:path=>calls.push(['folder',path])}});
 const options=await openers.options(root,'file.txt');assert.ok(options.some(item=>item.id==='default'&&item.icon));assert.ok(options.some(item=>item.id==='folder'));
 await openers.open(root,'file.txt','default');await openers.open(root,'file.txt','folder');assert.deepEqual(calls,[['default',file],['folder',file]]);
 await assert.rejects(openers.open(root,'file.txt','unknown-app'),/no longer available/);
});
