import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,readlink,rm,symlink,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isolatePackagedApp} from '../../../scripts/desktop/isolated-app.mjs';

async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'suffice-isolation-fixture-'));
 const app=join(root,'build','Suffice.app'),binary=join(app,'Contents/MacOS/Suffice'),resources=join(app,'Contents/Resources/app');
 await mkdir(join(app,'Contents/MacOS'),{recursive:true});await mkdir(resources,{recursive:true});
 await writeFile(binary,'fixture',{mode:0o755});await writeFile(join(resources,'package.json'),' {"type":"module"}');
 return {root,app,binary,resources};
}
const load=file=>execFileSync(process.execPath,['--input-type=module','-e','const value=await import('+JSON.stringify(pathToFileURL(file).href)+');process.stdout.write(String(value.answer));'],{encoding:'utf8',timeout:5000,stdio:['ignore','pipe','pipe'],env:{...process.env,NODE_PATH:'',NODE_OPTIONS:''}});

test('installed smoke exposes a missing dependency hidden by checkout ancestors',async()=>{
 const f=await fixture();let isolated;
 try{
  const ancestor=join(f.root,'node_modules/@suffice/harness');await mkdir(ancestor,{recursive:true});
  await writeFile(join(ancestor,'package.json'),'{"type":"module","exports":"./index.mjs"}');await writeFile(join(ancestor,'index.mjs'),'export const answer=42;');
  const worker=join(f.resources,'worker.mjs');await writeFile(worker,"export {answer} from '@suffice/harness';");
  assert.equal(load(worker),'42');
  isolated=await isolatePackagedApp(f.binary);
  assert.throws(()=>load(join(isolated.application,relative(f.app,worker))),error=>/ERR_MODULE_NOT_FOUND/.test(error.stderr.toString()));
 }finally{await isolated?.cleanup();await rm(f.root,{recursive:true,force:true});}
});

test('relative packaged modules and framework links survive removal of the checkout',{skip:process.platform==='win32'},async()=>{
 const f=await fixture();let isolated;
 try{
  const pkg=join(f.resources,'packages/harness');await mkdir(pkg,{recursive:true});await writeFile(join(pkg,'index.mjs'),'export const answer=42;');
  await writeFile(join(f.resources,'worker.mjs'),"export {answer} from './packages/harness/index.mjs';");
  const versions=join(f.app,'Contents/Frameworks/Fixture.framework/Versions');await mkdir(join(versions,'A'),{recursive:true});await writeFile(join(versions,'A/data'),'framework');await symlink('A',join(versions,'Current'));
  isolated=await isolatePackagedApp(f.binary);await rm(f.root,{recursive:true,force:true});
  assert.equal(load(join(isolated.application,'Contents/Resources/app/worker.mjs')),'42');
  const current=join(isolated.application,'Contents/Frameworks/Fixture.framework/Versions/Current');
  assert.equal(await readlink(current),'A');assert.equal(await readFile(join(current,'data'),'utf8'),'framework');
  assert.ok((await stat(isolated.binary)).mode&0o111);
 }finally{await isolated?.cleanup();await rm(f.root,{recursive:true,force:true});}
});

test('a packaged link to an external workspace is rejected before launch',{skip:process.platform==='win32'},async()=>{
 const f=await fixture();
 try{
  await writeFile(join(f.root,'outside'),'unshipped');await symlink(join(f.root,'outside'),join(f.resources,'external'));
  await assert.rejects(isolatePackagedApp(f.binary),/external or broken dependency link/);
 }finally{await rm(f.root,{recursive:true,force:true});}
});

test('TMPDIR inside a checkout cannot reintroduce ancestor dependencies',{skip:process.platform==='win32'},async()=>{
 const f=await fixture();
 try{
  const configured=join(f.root,'scratch');await mkdir(configured);await mkdir(join(f.root,'node_modules'));
  const helper=new URL('../../../scripts/desktop/isolated-app.mjs',import.meta.url).href;
  const code='import {isolatePackagedApp} from '+JSON.stringify(helper)+';const app=await isolatePackagedApp('+JSON.stringify(f.binary)+');try{process.stdout.write(JSON.stringify({root:app.root}));}finally{await app.cleanup();}';
  const result=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',timeout:5000,env:{...process.env,TMPDIR:configured,TMP:configured,TEMP:configured}}));
  assert.ok(!result.root.startsWith(f.root+'/'));
  await assert.rejects(stat(result.root),{code:'ENOENT'});
 }finally{await rm(f.root,{recursive:true,force:true});}
});
