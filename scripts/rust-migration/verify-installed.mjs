import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
const root=resolve(process.argv[2]||'.'),project=await mkdtemp(join(tmpdir(),'suffice-installed-tools-'));
try{
 await writeFile(join(project,'hello.mjs'),'export function hello(){return hello();}\n');
 const {nativeFiles}=await import(pathToFileURL(join(root,'packages/cli/src/native-files.mjs')).href);
 assert.deepEqual(await nativeFiles(project),['hello.mjs'],'installed addon must load; fallback is not accepted');
 const {repositoryTools}=await import(pathToFileURL(join(root,'packages/cli/src/tools.mjs')).href);
 const tools=repositoryTools({workspace:project,access:'read'});
 const call=async(name,args)=>(await tools.find(t=>t.name===name).execute('offline-native-check',args)).structuredContent;
 const symbols=await call('symbols',{query:'hello'});
 assert.deepEqual(symbols.matches,[{name:'hello',kind:'function',path:'hello.mjs',start:1,end:1}]);
 const body=await call('symbol_read',{path:'hello.mjs',name:'hello'});assert.match(body.text,/function hello/);
 const refs=await call('symbol_references',{name:'hello'});assert.equal(refs.total,1);
 console.log(JSON.stringify({nativeTraversal:true,symbols:true,symbolRead:true,symbolReferences:true,root,modelCalls:0}));
}finally{await rm(project,{recursive:true,force:true});}
