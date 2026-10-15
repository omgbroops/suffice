// Deterministic tool compatibility, not a model benchmark or capability score.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,symlink,unlink} from 'node:fs/promises';
import {repositoryTools} from '../src/general/tools.mjs';
const tools=repositoryTools({workspace:'/workspace',commandTimeout:15});
let id=0;const call=(name,args)=>tools.find(t=>t.name===name).execute('compat-'+(++id),args);
const rows=[];const check=async(name,fn)=>{try{await fn();rows.push({name,passed:true});}catch(e){rows.push({name,passed:false,error:e.message});}};
await check('edit JavaScript package and TypeScript package',async()=>{
 await call('edit',{path:'packages/core/index.js',edits:[{oldText:'export const increment = 1;',newText:'export const increment = 4;'}]});
 await call('edit',{path:'packages/cli/index.ts',edits:[{oldText:'const factor: number = 2;',newText:'const factor: number = 3;'}]});
});
await check('write root config hidden CI build script and new test',async()=>{
 await call('write',{path:'tsconfig.json',content:JSON.stringify({compilerOptions:{target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',outDir:'dist',allowJs:true},include:['packages/**/*']})});
 await call('write',{path:'.github/workflows/ci.yml',content:'name: CI\non: [push]\njobs: {}\n'});
 await call('write',{path:'tests/new.test.mjs',content:"import test from 'node:test';import assert from 'node:assert/strict';import {calculate} from '../packages/cli/index.ts';test('new integration',()=>assert.equal(calculate(2),18));\n"});
 assert.match(await readFile('/workspace/.github/workflows/ci.yml','utf8'),/CI/);
});
await check('project specific npm tests build and lint',async()=>{
 const r=await call('bash',{command:'npm test && npm run build && npm run lint',timeout:15});
 assert.equal(r.structuredContent?.exit_code??r.exit_code??r.details?.exitCode,0,JSON.stringify(r));
});
await check('JavaScript and TypeScript AST navigation',async()=>{
 for(const path of ['packages/core/index.js','packages/cli/index.ts']){
  const r=await call('symbols',{path});assert.ok(r.structuredContent.matches.length>0);
 }
 const found=await call('symbols',{});assert.ok(found.structuredContent.matches.some(x=>x.path.endsWith('.ts')));
});
await check('type syntax that is not strippable falls back explicitly',async()=>{
 await call('write',{path:'packages/cli/enum.ts',content:'export enum Mode { A, B }\n'});
 const r=await call('symbols',{path:'packages/cli/enum.ts'});assert.deepEqual(r.structuredContent.unparsed,['packages/cli/enum.ts']);
 const read=await call('read',{path:'packages/cli/enum.ts'});assert.ok(read.content.length);
});
await check('file paths cannot escape repository or follow external links',async()=>{
 await assert.rejects(call('read',{path:'../runtime/package.json'}),/outside/);
 await unlink('/workspace/outside-link').catch(e=>{if(e.code!=='ENOENT')throw e;});
 await symlink('/runtime/package.json','/workspace/outside-link');
 await assert.rejects(call('read',{path:'outside-link'}),/leaves/);
});
await check('commands and descendants cannot read private host files',async()=>{
 const paths=['/mnt/c/Users/Mohammed/Documents/GitHub/suffice-experiments/general-v1/.suffice/compat/private/canary.txt','/mnt/c/Users/Mohammed/Documents/GitHub/suffice-experiments/github-field-test/.suffice/field/private/h02.test.mjs'];
 const child="for(const p of "+JSON.stringify(paths)+"){try{require('fs').readFileSync(p);process.exit(9)}catch(e){if(!['ENOENT','EACCES'].includes(e.code))throw e;}}";
 await call('write',{path:'scripts/private-probe.cjs',content:child+"require('child_process').execFileSync(process.execPath,['-e',"+JSON.stringify(child)+"]);console.log('PRIVATE_ACCESS_DENIED');"});
 const r=await call('bash',{command:'node scripts/private-probe.cjs'});assert.match(JSON.stringify(r),/PRIVATE_ACCESS_DENIED/);assert.equal(r.structuredContent?.exit_code,0);
});
await check('outside writes denied by OS boundary',async()=>{
 const r=await call('bash',{command:"node -e \"try{require('fs').writeFileSync('/runtime/package.json','bad');process.exit(9)}catch(e){if(!['EROFS','EACCES'].includes(e.code))throw e;console.log('WRITE_DENIED')}\""});assert.match(JSON.stringify(r),/WRITE_DENIED/);
});
await check('command timeout terminates lingering child processes',async()=>{
 await call('write',{path:'scripts/linger.cjs',content:"const cp=require('child_process');cp.spawn(process.execPath,['-e',\"setTimeout(()=>require('fs').writeFileSync('/workspace/timeout-leak','bad'),3000)\"],{stdio:'ignore'});setInterval(()=>{},1000);"});
 await assert.rejects(call('bash',{command:'node scripts/linger.cjs',timeout:1}),/timed out|timeout/i);
 await new Promise(r=>setTimeout(r,3300));
 await assert.rejects(readFile('/workspace/timeout-leak'),e=>e.code==='ENOENT');
});
await writeFile('/receipts/compatibility.json',JSON.stringify({at:new Date().toISOString(),inferenceCalls:0,rows,passed:rows.every(r=>r.passed)},null,2));
console.log(JSON.stringify({rows,passed:rows.every(r=>r.passed)}));if(rows.some(r=>!r.passed))process.exitCode=1;
