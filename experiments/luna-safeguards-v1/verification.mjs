// Public verification only. This module has no evaluator/reference inputs.
import {readFile,writeFile,mkdir,readdir,lstat,copyFile,symlink,realpath} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
const sha=b=>createHash('sha256').update(b).digest('hex');
export const protectedPath=p=>p.split('/').some(x=>['test','tests','test-d','__tests__','fixtures','__fixtures__'].includes(x))||/(^|[./_-])(test|spec)([./_-]|$)/.test(p);
export async function createSafeguards({workspace,runDir,verification,log,signal}){
 if(!verification||!Array.isArray(verification.publicCommands)||!Array.isArray(verification.trackedPaths))throw Error('Public verification configuration required');
 const safe=p=>{if(typeof p!=='string'||isAbsolute(p)||p.includes('..')||p.includes('\0'))throw Error('Invalid public path');return resolve(workspace,p);};
 const base=new Map();for(const p of verification.trackedPaths){safe(p);base.set(p,await readFile(safe(p)));}const originals=new Map([...base].filter(([p])=>protectedPath(p)));
 async function publicFiles(folder=workspace,prefix=''){const rows=new Map();for(const e of await readdir(folder,{withFileTypes:true})){if(['.git','node_modules','.suffice'].includes(e.name))continue;const p=prefix?prefix+'/'+e.name:e.name;if(e.isDirectory()){for(const[x,b]of await publicFiles(resolve(folder,e.name),p))rows.set(x,b);}else if(e.isFile())rows.set(p,await readFile(resolve(folder,e.name)));}return rows;}
 async function digest(){const rows=[...await publicFiles()].filter(([p])=>!protectedPath(p)&&!p.startsWith('.suffice-checks/')).map(([p,b])=>[p,sha(b)]).sort(([a],[b])=>a.localeCompare(b));return sha(JSON.stringify(rows));}
 const initial=await digest();let productionChanged=false;const observations=[],gates=[];
 async function observedExecute(tool,id,args,toolSignal,onUpdate){
  const before=await digest();const wasChanged=productionChanged||before!==initial;let result;
  try{return result=await tool.execute(id,args,toolSignal,onUpdate);}
  finally{const after=await digest();productionChanged ||= after!==initial;
   if(tool.name==='bash'&&/\bnode\s+(?:\.\/)?\.suffice-checks\/probe\.mjs\b/.test(args.command??'')){
    const row={type:'safeguard_probe_execution',beforeProductionEdit:!wasChanged&&after===initial,sourceUnchangedDuringCommand:before===after,command:args.command,resultIsError:result?.isError??null,at:new Date().toISOString()};observations.push(row);log(row);
   }
  }
 }
 async function copyPublic(source,dest,prefix=''){
  await mkdir(dest,{recursive:true});for(const e of await readdir(source,{withFileTypes:true})){
   if(['.git','node_modules','.suffice'].includes(e.name))continue;const a=resolve(source,e.name),b=resolve(dest,e.name),p=prefix?prefix+'/'+e.name:e.name;
   if(e.isDirectory())await copyPublic(a,b,p);else if(e.isFile()){await mkdir(dirname(b),{recursive:true});await copyFile(a,b);}
   // Existing dependency links are recreated explicitly; arbitrary links are not followed.
  }
 }
 async function command(argv,cwd,label){
  const started=Date.now();await mkdir(resolve(runDir,'public-verification'),{recursive:true});
  if(signal.aborted)return {command:argv,exitCode:null,aborted:true,latencyMs:0,summary:'Attempt allowance already exhausted'};
  return new Promise(done=>{
   const child=spawn(argv[0],argv.slice(1),{cwd,env:process.env,detached:true,stdio:['ignore','pipe','pipe']});let out='',err='',limited=false,finished=false;
   const stop=()=>{try{process.kill(-child.pid,'SIGTERM');}catch{}};
   signal.addEventListener('abort',stop,{once:true});const timer=setTimeout(stop,Math.min(verification.commandTimeoutMs??120000,120000));
   const add=(kind,b)=>{if(Buffer.byteLength(out)+Buffer.byteLength(err)+b.length>4*1024**2){limited=true;stop();return;}if(kind==='out')out+=b;else err+=b;};
   child.stdout.on('data',b=>add('out',b));child.stderr.on('data',b=>add('err',b));child.on('error',e=>err+=e.message);
   child.on('close',async code=>{if(finished)return;finished=true;clearTimeout(timer);signal.removeEventListener('abort',stop);
    await writeFile(resolve(runDir,'public-verification',label+'-stdout.txt'),out);await writeFile(resolve(runDir,'public-verification',label+'-stderr.txt'),err);
    let summary=(out+'\n'+err).slice(-10000),failureNames=null;
    if(verification.nativeParser==='mocha-json'&&label.includes('native-')){try{const d=JSON.parse(out);failureNames=(d.failures??[]).map(f=>f.fullTitle).sort();summary=JSON.stringify({stats:d.stats,failures:d.failures});}catch{summary='Invalid native JSON output\n'+summary;}}
    const result={command:argv,exitCode:code,latencyMs:Date.now()-started,outputLimited:limited,failureNames,summary:summary.slice(-10000),logs:'public-verification/'+label};log({type:'safeguard_public_command',...result});done(result);
   });
  });
 }
 async function runGate(phase){
  await mkdir(resolve(runDir,'public-verification'),{recursive:true});const current=await publicFiles(),patch=[];
  for(const p of [...new Set([...base.keys(),...current.keys()])].sort()){const before=base.get(p),after=current.get(p);if(before?.equals(after??Buffer.alloc(0))&&after!==undefined)continue;if(before===undefined&&after===undefined)continue;patch.push({path:p,before:before===undefined?null:before.toString('base64'),after:after===undefined?null:after.toString('base64'),protectedTest:protectedPath(p)});}
  await writeFile(resolve(runDir,'public-verification',phase+'-patch.json'),JSON.stringify(patch));
  const gateRoot='/tmp/suffice-public-gate-'+phase;await copyPublic(workspace,gateRoot);
  for(const[p,b]of originals){const dest=resolve(gateRoot,p);await mkdir(dirname(dest),{recursive:true});await writeFile(dest,b);}
  try{await symlink(await realpath(resolve(workspace,'node_modules')),resolve(gateRoot,'node_modules'),'dir');}catch(e){if(e.code!=='ENOENT')throw e;}
  const commands=[];for(let i=0;i<verification.publicCommands.length;i++)commands.push(await command(verification.publicCommands[i],gateRoot,phase+'-native-'+i));
  const expected=verification.nativeExitCodes??verification.publicCommands.map(()=>0);let nativeValid=commands.every((r,i)=>r.exitCode===expected[i]&&!r.outputLimited);
  if(verification.nativeParser==='mocha-json')nativeValid &&= commands.every(r=>JSON.stringify(r.failureNames)===JSON.stringify([...(verification.nativeFailureNames??[])].sort()));
  const authored=[];for(const name of ['probe','preserve']){
   let exists=false;try{exists=(await lstat(resolve(gateRoot,'.suffice-checks',name+'.mjs'))).isFile();}catch(e){if(e.code!=='ENOENT')throw e;}
   authored.push(exists?{name,...await command([process.execPath,'.suffice-checks/'+name+'.mjs'],gateRoot,phase+'-'+name)}:{name,exitCode:null,missing:true,summary:'Expected public '+name+' script was not created'});
  }
  const passed=nativeValid&&authored.every(r=>r.exitCode===0&&!r.outputLimited),row={type:'safeguard_gate',phase,passed,nativeValid,protectedOriginalFilesRestored:originals.size,commands,authored,preEditProbeObserved:observations.some(r=>r.beforeProductionEdit),sourceDigest:await digest(),at:new Date().toISOString()};gates.push(row);log(row);await writeFile(resolve(runDir,'public-verification',phase+'-gate.json'),JSON.stringify(row,null,2));return row;
 }
 const feedback=g=>`Public verification found unresolved checks after your submitted edit. This is public project/probe feedback, not hidden acceptance. You have one bounded continuation within the SAME total allowance. Diagnose and repair valid failures; a self-authored assertion may itself be wrong, so verify its public contract. Do not alter original expectations merely to pass. Retain .suffice-checks/probe.mjs and preserve.mjs as meaningful, independently executable checks.\n${JSON.stringify({nativeValid:g.nativeValid,preEditProbeObserved:g.preEditProbeObserved,failures:[...g.commands,...g.authored].filter((r,i)=>i<g.commands.length?r.exitCode!==(verification.nativeExitCodes??[])[i]||r.failureNames&&JSON.stringify(r.failureNames)!==JSON.stringify([...(verification.nativeFailureNames??[])].sort()):r.exitCode!==0).map(r=>({command:r.command,name:r.name,exitCode:r.exitCode,summary:r.summary}))})}`;
 return {wrap:tool=>({...tool,execute:(...args)=>observedExecute(tool,...args)}),runGate,feedback,summary:()=>({observedPreEditProbes:observations.filter(r=>r.beforeProductionEdit).length,probeExecutions:observations.length,gates:gates.map(g=>({phase:g.phase,passed:g.passed,nativeValid:g.nativeValid})),gateCommands:gates.reduce((n,g)=>n+g.commands.length+g.authored.filter(x=>!x.missing).length,0)})};
}
