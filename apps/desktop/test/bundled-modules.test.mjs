import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {writeBundledModules} from '../../../scripts/desktop/bundled-modules.mjs';

async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'suffice-bundled-modules-'));
 await writeFile(join(root,'package.json'),JSON.stringify({name:'suffice-desktop',type:'module',main:'apps/desktop/electron/main.cjs'}));
 await mkdir(join(root,'packages/harness'),{recursive:true});await mkdir(join(root,'packages/cli/src'),{recursive:true});await mkdir(join(root,'node_modules/fixture-sdk'),{recursive:true});
 await writeFile(join(root,'packages/harness/index.mjs'),"export {createSession} from '../cli/src/session.mjs';");
 await writeFile(join(root,'packages/cli/package.json'),'{"name":"@bycontinuity/suffice","version":"0.1.0","type":"module"}');
 await writeFile(join(root,'packages/cli/src/session.mjs'),"import {token} from 'fixture-sdk';export const createSession=()=>token;");
 await writeFile(join(root,'node_modules/fixture-sdk/package.json'),'{"type":"module","exports":"./index.mjs"}');
 await writeFile(join(root,'node_modules/fixture-sdk/index.mjs'),'export const token={};');
 return root;
}

test('bundled workspace APIs resolve locally and share the application SDK',async()=>{
 const root=await fixture();
 try{
  await writeBundledModules(root);
  const proof=join(root,'proof.mjs');
  await writeFile(proof,"import {createSession as alias} from '@suffice/harness';import {createSession as direct} from './packages/cli/src/session.mjs';import {createSession as cli} from '@bycontinuity/suffice/src/session.mjs';process.stdout.write(JSON.stringify({canonical:alias===direct,canonicalCli:cli===direct,sameSdk:cli()===direct()}));");
  const result=execFileSync(process.execPath,[proof],{cwd:tmpdir(),encoding:'utf8',timeout:5000,env:{...process.env,NODE_PATH:'',NODE_OPTIONS:''}});
  assert.deepEqual(JSON.parse(result),{canonical:true,canonicalCli:true,sameSdk:true});
  // Repeating the build hook replaces only the two controlled package entries.
  await writeBundledModules(root);
  assert.equal(await readFile(join(root,'node_modules/fixture-sdk/index.mjs'),'utf8'),'export const token={};');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('CLI aliases share mutable module state, default exports and executable entry behavior',async()=>{
 const root=await fixture();
 try{
  await writeFile(join(root,'packages/cli/src/cache.mjs'),'const cache=new WeakMap();export const use=key=>{if(!cache.has(key))cache.set(key,{});return cache.get(key)};export default cache;');
  await writeFile(join(root,'packages/cli/src/state.cjs'),'module.exports={value:1};');
  await mkdir(join(root,'packages/cli/bin'));await writeFile(join(root,'packages/cli/bin/suffice.mjs'),'#!/usr/bin/env node\nprocess.stdout.write("fixture-cli");',{mode:0o755});
  await writeBundledModules(root);
  const proof=join(root,'state-proof.mjs');
  await writeFile(proof,"import cache,{use} from './packages/cli/src/cache.mjs';import alias,{use as other} from '@bycontinuity/suffice/src/cache.mjs';import {createRequire} from 'node:module';const require=createRequire(import.meta.url);const key={};process.stdout.write(JSON.stringify({function:use===other,default:cache===alias,state:use(key)===other(key),cjs:require('./packages/cli/src/state.cjs')===require('@bycontinuity/suffice/src/state.cjs')}));");
  assert.deepEqual(JSON.parse(execFileSync(process.execPath,[proof],{encoding:'utf8',timeout:5000})),{function:true,default:true,state:true,cjs:true});
  const bin=join(root,'node_modules/@bycontinuity/suffice/bin/suffice.mjs');
  assert.match(await readFile(bin,'utf8'),/^#!\/usr\/bin\/env node\n/);
  assert.equal(execFileSync(process.execPath,[bin],{encoding:'utf8',timeout:5000}),'fixture-cli');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('bundled module creation refuses a scope directory redirected outside the app',{skip:process.platform==='win32'},async()=>{
 const root=await fixture(),outside=await mkdtemp(join(tmpdir(),'suffice-bundle-outside-'));
 try{
  await writeFile(join(outside,'sentinel'),'untouched');await symlink(outside,join(root,'node_modules/@suffice'));
  await assert.rejects(writeBundledModules(root),/real directory/);
  assert.equal(await readFile(join(outside,'sentinel'),'utf8'),'untouched');
 }finally{await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
});
