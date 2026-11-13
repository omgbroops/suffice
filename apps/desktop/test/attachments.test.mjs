import {pathToFileURL} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{prepareAttachments,clipboardFiles}=require('../electron/attachments.cjs');
test('attachments stay in app storage and images reach the harness separately',async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-attachment-'));
 const result=await prepareAttachments(home,[{name:'../../image.png',type:'image/png',data:Buffer.from('fixture').toString('base64')}]);
 const reference=JSON.parse(result.context.trim().split('\n').at(-1));assert.ok(!relative(home,reference.path).startsWith('..'));assert.equal(await readFile(reference.path,'utf8'),'fixture');assert.deepEqual(result.images,[{type:'image',data:'Zml4dHVyZQ==',mimeType:'image/png'}]);
 await assert.rejects(prepareAttachments(home,[{name:'invalid',data:'not base64!'}]),/Invalid attachment/);
 const file=resolve(home,'copied.txt');await writeFile(file,'copied');// fake shaped like Electron 45's clipboard (the OS clipboard is a native edge): async read() -> items with types + getType()
 const raw=format=>`electron application/osclipboard;format="${format}"`;
 const board=entries=>({read:async()=>entries.map(entry=>({types:Object.keys(entry),getType:async type=>{if(!(type in entry))throw new Error('missing');return new Blob([entry[type]]);}}))});
 const second=resolve(home,'second.png');await writeFile(second,'png');
 let items=await clipboardFiles(board([{[raw('public.file-url')]:pathToFileURL(file).href,'text/plain':'copied.txt'},{[raw('public.file-url')]:pathToFileURL(second).href}]));
 assert.deepEqual(items.map(item=>[item.name,item.type]),[['copied.txt','application/octet-stream'],['second.png','image/png']]);assert.equal(Buffer.from(items[0].data,'base64').toString(),'copied');
 items=await clipboardFiles(board([{[raw('FileNameW')]:Buffer.from(file+'\0','utf16le')}]));assert.equal(items[0].name,'copied.txt');
 items=await clipboardFiles(board([{'text/uri-list':pathToFileURL(file).href+'\r\n'}]));assert.equal(items[0].name,'copied.txt');
 assert.deepEqual(await clipboardFiles(board([{'text/plain':'just text','text/html':'<b>x</b>'}])),[]);
});
