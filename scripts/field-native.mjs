import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
export async function nativeSuite(workspace,task,out){
 await mkdir(out,{recursive:true});
 const args=task==='h02'?['node_modules/mocha/bin/mocha','--reporter','json']:['--no-experimental-strip-types','node_modules/mocha/bin/mocha.js','--require','ts-node/register','--ui','tdd','--reporter','json','test/*.ts'];
 const start=Date.now();
 return new Promise(done=>{
 const p=spawn(process.execPath,args,{cwd:workspace,env:process.env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='',timedOut=false;const timer=setTimeout(()=>{timedOut=true;p.kill();},30000);
 p.stdout.on('data',b=>stdout+=b);p.stderr.on('data',b=>stderr+=b);
 p.on('close',async code=>{clearTimeout(timer);let parsed;try{parsed=JSON.parse(stdout);}catch{}
 const r={command:[process.execPath,...args],exitCode:code,timedOut,latencyMs:Date.now()-start,stats:parsed?.stats,failures:parsed?.failures?.map(f=>({title:f.fullTitle,error:f.err?.message})),passed:code===0&&!timedOut&&parsed?.stats?.tests>0&&parsed.stats.failures===0};
 await writeFile(resolve(out,'stdout.txt'),stdout);await writeFile(resolve(out,'stderr.txt'),stderr);await writeFile(resolve(out,'result.json'),JSON.stringify(r,null,2));done(r);
 });
 });
}
if(process.argv[2]==='preflight'){for(const id of ['h02','l01'])console.log(id,JSON.stringify(await nativeSuite(resolve('.suffice/field/bases',id),id,resolve('.suffice/field/native-preflight',id))));}
