// Single intervention: immutable ORIGINAL PUBLIC regression gate, one bounded repair.
// No authored oracle, hidden tests, reference solution, or extra planning call.
import {readFile,writeFile,mkdir,readdir,copyFile,realpath,symlink} from 'node:fs/promises';
import {resolve,dirname,isAbsolute} from 'node:path';
import {spawn} from 'node:child_process';
export const protectedPath=p=>p.split('/').some(x=>['test','tests','test-d','__tests__','fixtures','__fixtures__'].includes(x))||/(^|[./_-])(test|spec)([./_-]|$)/.test(p);
export async function createPublicGate({workspace,runDir,verification,log,signal}){
 if(!verification?.trackedPaths?.length||!verification?.publicCommands?.length)throw Error('Public gate configuration missing');
 const originals=new Map();
 for(const p of verification.trackedPaths){if(isAbsolute(p)||p.split('/').includes('..'))throw Error('Unsafe original public path');originals.set(p,await readFile(resolve(workspace,p)));}
 const gates=[];
 async function files(folder=workspace,prefix=''){
  const rows=new Map();for(const e of await readdir(folder,{withFileTypes:true})){
   if(['.git','node_modules','.suffice'].includes(e.name))continue;
   const p=prefix?prefix+'/'+e.name:e.name,a=resolve(folder,e.name);
   if(e.isDirectory())for(const[k,v]of await files(a,p))rows.set(k,v);else if(e.isFile())rows.set(p,await readFile(a));
  }return rows;
 }
 async function command(argv,cwd,label){
  if(signal.aborted)return {command:argv,exitCode:null,aborted:true};
  const start=Date.now();return new Promise(done=>{
   const child=spawn(argv[0],argv.slice(1),{cwd,env:process.env,detached:true,stdio:['ignore','pipe','pipe']});
   let out='',err='',limited=false,timedOut=false;const stop=()=>{try{process.kill(-child.pid,'SIGTERM');}catch{}};
   signal.addEventListener('abort',stop,{once:true});const timer=setTimeout(()=>{timedOut=true;stop();},verification.commandTimeoutMs??120000);
   const add=(kind,b)=>{if(Buffer.byteLength(out)+Buffer.byteLength(err)+b.length>4*1024**2){limited=true;stop();return;}if(kind==='out')out+=b;else err+=b;};
   child.stdout.on('data',b=>add('out',b));child.stderr.on('data',b=>add('err',b));child.on('error',e=>{err+=e.message;});
   child.on('close',async code=>{clearTimeout(timer);signal.removeEventListener('abort',stop);
    await writeFile(resolve(runDir,'public-verification',label+'-stdout.txt'),out);await writeFile(resolve(runDir,'public-verification',label+'-stderr.txt'),err);
    const row={command:argv,exitCode:code,outputLimited:limited,timedOut,latencyMs:Date.now()-start,summary:(out+'\n'+err).slice(-10000)};log({type:'preservation_command',...row});done(row);
   });
  });
 }
 async function runGate(phase){
  await mkdir(resolve(runDir,'public-verification'),{recursive:true});const current=await files(),patch=[];
  for(const p of [...new Set([...originals.keys(),...current.keys()])].sort()){
   const before=originals.get(p),after=current.get(p);if(before&&after&&before.equals(after))continue;
   patch.push({path:p,before:before?.toString('base64')??null,after:after?.toString('base64')??null,protectedTest:protectedPath(p)});
  }
  await writeFile(resolve(runDir,'public-verification',phase+'-patch.json'),JSON.stringify(patch));
  const root=resolve('/tmp','suffice-public-regression-'+phase);await mkdir(root,{recursive:true});
  // The identical public source + original tests policy used by the independent evaluator.
  for(const[p,b]of current)if(!protectedPath(p)){const d=resolve(root,p);await mkdir(dirname(d),{recursive:true});await writeFile(d,b);}
  for(const[p,b]of originals)if(protectedPath(p)){const d=resolve(root,p);await mkdir(dirname(d),{recursive:true});await writeFile(d,b);}
  await symlink(await realpath(resolve(workspace,'node_modules')),resolve(root,'node_modules'),'dir');
  const commands=[];for(let i=0;i<verification.publicCommands.length;i++)commands.push(await command(verification.publicCommands[i],root,phase+'-'+i));
  const passed=commands.every(c=>c.exitCode===0&&!c.outputLimited&&!c.timedOut);
  const row={type:'preservation_gate',phase,passed,nativeValid:passed,commands,protectedOriginalFilesRestored:[...originals.keys()].filter(protectedPath).length};
  gates.push(row);log(row);await writeFile(resolve(runDir,'public-verification',phase+'-gate.json'),JSON.stringify(row,null,2));return row;
 }
 const feedback=g=>'The ORIGINAL PUBLIC project regression checks failed on your submitted production changes. Original tests were restored in a separate copy. You have one continuation within the SAME cumulative task budget to repair these regressions. No hidden acceptance or reference solution is being provided.\n'+JSON.stringify(g.commands.filter(c=>c.exitCode!==0||c.outputLimited||c.timedOut).map(c=>({command:c.command,exitCode:c.exitCode,summary:c.summary})));
 return {runGate,feedback,summary:()=>({gates:gates.map(g=>({phase:g.phase,passed:g.passed})),commands:gates.reduce((n,g)=>n+g.commands.length,0)})};
}
