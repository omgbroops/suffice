import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createNativeFiles,nativeFiles} from './native-files.mjs';
import {filesIn,filesIn as filesInJavaScript} from './workspace.mjs';

const binary=process.env.SUFFICE_TEST_NATIVE_FS;

test('native traversal matches the JS walk through changes and unusual names', {skip:!binary}, async t=>{
  const root=await mkdtemp(resolve(tmpdir(),'suffice-native-fs-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  for(const dir of ['Á', 'a dir', 'a.dir', 'node_modules', '.hidden']) await mkdir(resolve(root,dir));
  for(const name of ['z.js','é.js','é.js','a dir/inside','a.dir/z','Á/x','node_modules/ignored','.hidden/ignored']) await writeFile(resolve(root,name),'x');
  try {await symlink(resolve(root,'a dir'),resolve(root,'link'),'dir');} catch(e) {if(!['EPERM','EACCES','ENOTSUP'].includes(e.code))throw e;}
  for(const directory of ['', 'a dir', './a.dir', 'missing']) {
    if(directory==='missing') {assert.equal(await nativeFiles(root,directory,binary),null);await assert.rejects(filesInJavaScript(root,directory),{code:'ENOENT'});continue;}
    assert.deepEqual(await nativeFiles(root,directory,binary),await filesInJavaScript(root,directory));
  }
  await writeFile(resolve(root,'a dir/new'),'x');
  await rm(resolve(root,'z.js'));
  assert.deepEqual(await nativeFiles(root,'',binary),await filesInJavaScript(root));
});

test('missing helper falls back to original traversal and preserves filesystem errors',async t=>{
  const root=await mkdtemp(resolve(tmpdir(),'suffice-native-fs-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await writeFile(resolve(root,'a'),'x');
  assert.equal(await nativeFiles(root,'',resolve(root,'missing-helper')),null);
  assert.equal(await nativeFiles(root,'',process.execPath),null);
  assert.deepEqual(await filesIn(root),await filesInJavaScript(root));
  await assert.rejects(filesIn(root,'missing'),{code:'ENOENT'});
});

test('canonical locale ties preserve scandir order across files and directories', {skip:!binary}, async t=>{
  const root=await mkdtemp(resolve(tmpdir(),'suffice-native-ties-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  // Create in reverse of UTF-8 order; the two names compare equal by locale.
  await writeFile(resolve(root,'é'),'file');
  await mkdir(resolve(root,'é'));
  await writeFile(resolve(root,'é','inside'),'file');
  assert.equal('é'.localeCompare('é'),0);
  const raw=spawnSync(binary,['--protocol=1',root],{encoding:'utf8'});
  assert.equal(raw.status,0,raw.stderr);
  assert.deepEqual(JSON.parse(raw.stdout),['é/inside','é']);
  assert.deepEqual(await nativeFiles(root,'',binary),await filesInJavaScript(root));
});

test('helper rejects invalid protocol and argument counts', {skip:!binary}, ()=>{
  for(const args of [[],['--protocol=2','.'],['--protocol=1'],['--protocol=1','.','extra']]) {
    const result=spawnSync(binary,args,{encoding:'utf8'});
    assert.notEqual(result.status,0);
    assert.equal(result.stdout,'');
  }
});

test('malformed output and child failures fail closed and kill stalled helpers',async()=>{
  const fixture=fileURLToPath(new URL('./fixtures/native-helper.mjs',import.meta.url));
  for(const mode of ['invalid-json','invalid-utf8','duplicate','conflict','nonzero','oversize','timeout']) {
    let exited;
    const helper=createNativeFiles({timeoutMs:500,maximumBytes:128,spawn:(_binary,_args,options)=>{
      const child=spawn(process.execPath,[fixture,mode],options);
      exited=new Promise(resolve=>child.once('exit',resolve));
      return child;
    }});
    assert.equal(await helper('.'),null,mode);
    await Promise.race([exited,new Promise((_,reject)=>setTimeout(()=>reject(new Error(`child did not exit: ${mode}`)),2000).unref())]);
  }
});
