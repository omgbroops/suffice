import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {boxesList,boxCheckpoints,boxesManifest,boxesSlots,boxesActivate} from '../electron/boxes-ipc.mjs';

test('boxes ipc exposes manifest, slots and activate',async()=>{
 const srv=http.createServer((q,r)=>{r.setHeader('content-type','application/json');
  r.end(JSON.stringify({data:q.url.endsWith('/checkpoints')?[{id:'ck-1',name:'a'}]:[{id:'vm-0123456789',name:'dev',state:'running'}],page:{}}));});
 await new Promise(r=>srv.listen(0,'127.0.0.1',r));
 const env={...process.env};process.env.SUFFICE_BOXES_URL=`http://127.0.0.1:${srv.address().port}`;process.env.SUFFICE_BOXES_TOKEN='t';
 try{const home=mkdtempSync(join(tmpdir(),'bx-'));
  assert.equal(boxesManifest().name,'boxes');assert.ok(boxesManifest().contributes.tools.includes('box.fork'));
  await boxesList(home);await boxCheckpoints(home,'vm-0123456789');
  const s=boxesSlots(home);
  assert.ok(s.catalog.some(c=>c.id==='boxes:list'));
  assert.equal(s.values.find(v=>v.id==='boxes:list').value.length,1);
  assert.equal(s.values.find(v=>v.id==='box:vm-0123456789:checkpoints').value.length,1);
  assert.deepEqual((await boxesActivate(home)).tools.sort(),boxesManifest().contributes.tools.slice().sort());
 }finally{process.env.SUFFICE_BOXES_URL=env.SUFFICE_BOXES_URL;process.env.SUFFICE_BOXES_TOKEN=env.SUFFICE_BOXES_TOKEN;srv.close();}
});
