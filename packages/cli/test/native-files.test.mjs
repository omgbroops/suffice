import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
import {createNativeFiles} from '../src/native-files.mjs';
import {filesIn,filesInJavaScript} from '../src/workspace.mjs';

const defaultPath=fileURLToPath(new URL(`../native/suffice-fs-${process.platform}-${process.arch}.node`,import.meta.url));
const path=process.env.SUFFICE_TEST_NATIVE_FS||(existsSync(defaultPath)?defaultPath:null);
const addon=path?createRequire(import.meta.url)(path):null;

test('addon asynchronously matches the JS walk across mutations and locale ties', {skip:!addon}, async t=>{
  const root=await mkdtemp(resolve(tmpdir(),'suffice-native-fs-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  for(const dir of ['a dir','a.dir','node_modules','.hidden','é-dir'])await mkdir(resolve(root,dir));
  for(const name of ['z.js','é.txt','é-dir/inside','a dir/inside','a.dir/z','node_modules/ignored','.hidden/ignored'])await writeFile(resolve(root,name),'x');
  // APFS can alias canonically equivalent spellings. Exercise both names on
  // filesystems that distinguish them without colliding a file with a directory.
  try {await writeFile(resolve(root,'é.txt'),'x',{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;t.diagnostic('Filesystem aliases NFC/NFD names; comparing its retained spelling');}
  try {await symlink(resolve(root,'a dir'),resolve(root,'link'),'dir');}catch(e){if(!['EPERM','EACCES','ENOTSUP'].includes(e.code))throw e;}
  assert.equal('é'.localeCompare('é'),0);
  const helper=createNativeFiles({load:()=>addon});
  const raw=addon.walk(root);assert.equal(typeof raw.then,'function');await raw;
  for(const dir of ['', 'a dir', './a.dir'])assert.deepEqual(await helper(root,dir),await filesInJavaScript(root,dir));
  assert.equal(await helper(root,'missing'),null);
  await writeFile(resolve(root,'a dir/new'),'x');await rm(resolve(root,'z.js'));
  assert.deepEqual(await helper(root),await filesInJavaScript(root));
});

test('unavailable, failed and malformed addons fall back and preserve filesystem errors',async t=>{
  const root=await mkdtemp(resolve(tmpdir(),'suffice-native-fs-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await writeFile(resolve(root,'a'),'x');
  for(const load of [()=>null,()=>{throw Error('load');},()=>({walk:async()=>{throw Error('walk');}}),()=>({walk:async()=>['a','a/b']}),()=>({walk:async()=>['a','a']}),()=>({walk:async()=>42}),()=>({walk:async()=>['../escape']})])assert.equal(await createNativeFiles({load})(root),null);
  assert.deepEqual(await filesIn(root),await filesInJavaScript(root));
  await assert.rejects(filesIn(root,'missing'),{code:'ENOENT'});
});

test('one native walk at a time leaves concurrent traversal and fs.stat available',async t=>{
  const root=await mkdtemp(resolve(tmpdir(),'suffice-native-busy-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await writeFile(resolve(root,'a'),'x');
  let release,entered;
  const started=new Promise(r=>entered=r);
  const helper=createNativeFiles({load:()=>({walk:()=>{entered();return new Promise(r=>release=r);}})});
  const first=helper(root);await started;
  const walk=async()=>await helper(root)??filesInJavaScript(root);
  const [second,marker]=await Promise.all([walk(),stat(resolve(root,'a'))]);
  assert.deepEqual(second,['a']);assert.equal(marker.isFile(),true);
  release(['a']);assert.deepEqual(await first,['a']);
  assert.deepEqual(await filesIn(root),['a']);
});

test('real addon runs off the event loop on a wide tree', {skip:!addon}, async t=>{
  const root=await mkdtemp(resolve(tmpdir(),'suffice-native-wide-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  for(let i=0;i<24;i++){const dir=resolve(root,`d${i}`);await mkdir(dir);for(let j=0;j<10;j++)await writeFile(resolve(dir,`f${j}`),'x');}
  const helper=createNativeFiles({load:()=>addon});
  let heartbeat=false;const work=helper(root);setImmediate(()=>{heartbeat=true;});
  const result=await work;assert.equal(heartbeat,true);
  assert.deepEqual(result,await filesInJavaScript(root));
});

test('Windows directory junctions are skipped by native and JS walks', {skip:process.platform!=='win32'||!addon}, async t=>{
  const root=await mkdtemp(resolve(tmpdir(),'suffice-native-junction-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(resolve(root,'target'));
  await writeFile(resolve(root,'target','file'),'x');
  await symlink(resolve(root,'target'),resolve(root,'junction'),'junction');
  const helper=createNativeFiles({load:()=>addon});
  assert.deepEqual(await helper(root),['target/file']);
  assert.deepEqual(await helper(root),await filesInJavaScript(root));
});
