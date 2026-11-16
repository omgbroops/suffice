import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile, stat, truncate} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createNativeServices} from '../native-services.mjs';
import {execFileSync} from 'node:child_process';

test('clipboard skips a named pipe without waiting for a writer',{skip:process.platform==='win32',timeout:5000},async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'suffice-native-fifo-'));
  try {
    const pipe=path.join(root,'selection');execFileSync('mkfifo',[pipe]);
    const api=createNativeServices(async()=>({files:[pipe],image:false}));
    assert.deepEqual(await api.clipboardFiles(),[]);
  } finally {await rm(root,{recursive:true,force:true});}
});

test('clipboard file attachments retain bytes, names, timestamps and aggregate size limit',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'suffice-native-'));
  try{
    const file=path.join(root,'photo.png');
    await writeFile(file,Buffer.from([0,17,255]));
    let staged;
    const api=createNativeServices(async(method,png)=>{assert.equal(method,'clipboard.snapshot');staged=path.dirname(png);return {files:[root,file],image:false};});
    const [item]=await api.clipboardFiles();
    assert.equal(item.name,'photo.png');assert.equal(item.type,'image/png');
    assert.equal(item.size,3);assert.equal(item.data,'ABH/');assert.equal(item.modified,(await stat(file)).mtimeMs);
    await assert.rejects(stat(staged),{code:'ENOENT'});
    await truncate(file,20*1024*1024+1);
    await assert.rejects(api.clipboardFiles(),/20 MB/);
    await assert.rejects(stat(staged),{code:'ENOENT'});
  }finally{await rm(root,{recursive:true,force:true});}
});

test('clipboard image handoff reads the privately staged file and removes it',async()=>{
  let staged;
  const api=createNativeServices(async(_method,file)=>{staged=file;await writeFile(file,'actual bytes');return {image:true,files:[]};});
  const [snapshot]=await api.clipboardFiles();
  assert.equal(snapshot.name,'clipboard.png');assert.equal(snapshot.type,'image/png');
  assert.equal(Buffer.from(snapshot.data,'base64').toString(),'actual bytes');
  await assert.rejects(stat(staged),{code:'ENOENT'});
});

test('adapter passes native operation errors through to caller',async()=>{
  const api=createNativeServices(async()=>{throw Error('OS rejected operation');});
  for(const result of [api.thumbnail('x'),api.setStartup(true),api.openProjectWindow('a','b','c'),api.notify('done'),api.clipboardFiles()]){
    await assert.rejects(result,/OS rejected/);
  }
});
