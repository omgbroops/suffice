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
 const reference=JSON.parse(result.context.trim().split('\n').at(-1));assert.ok(!relative(home,reference.path).startsWith('..'));assert.equal(await readFile(reference.path,'utf8'),'fixture');assert.deepEqual(result.images,[{type:'image',data:'Zml4dHVyZQ==',mimeType:'image/png'}]);assert.deepEqual(result.metadata,[{name:'image.png',type:'image/png',size:7,imageIndex:0}]);assert.equal(JSON.stringify(result.metadata).includes('Zml4dHVyZQ=='),false);
 await assert.rejects(prepareAttachments(home,[{name:'invalid',data:'not base64!'}]),/Invalid attachment/);
 const file=resolve(home,'copied.txt');await writeFile(file,'copied');const items=await clipboardFiles({availableFormats:()=>['FileNameW'],readBuffer:()=>Buffer.from(file+'\0','utf16le')});assert.equal(items[0].name,'copied.txt');assert.equal(Buffer.from(items[0].data,'base64').toString(),'copied');
});
