import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {Type} from 'typebox';
import {workspaceTools,MAX_FILE_BYTES,hash} from '../workspace.mjs';
import {createNavigation} from '../symbol-navigation.mjs';
import {observationTools} from '../tool-observations.mjs';
import {safePath,captureTree,protectedFiles} from '../v9/workspace.mjs';
import {runPublicCheck} from '../v9/checks.mjs';
import {runProcess} from '../v9/process.mjs';
import {validateCommand} from './config.mjs';

const result=value=>({content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value,details:{}});
export async function createWorkerTools({workspace,runDir,signal,checks=[],compactResponses=false,log=()=>{}}){
  const protectedTree=protectedFiles(await captureTree(workspace,{includeIgnored:true}));
  let serial=Promise.resolve();
  const make=(name,description,parameters,fn)=>({name,label:name,description,parameters,outputSchema:Type.Unknown(),async execute(_id,args){signal.throwIfAborted();return result(await fn(args));}});
  const mutate=fn=>{const next=serial.then(fn);serial=next.catch(()=>{});return next;};
  const write=async(path,content)=>{if(protectedTree.has(path))throw Error('Existing tests and check configuration are protected');if(Buffer.byteLength(content)>MAX_FILE_BYTES)throw Error('File exceeds tool allowance');const target=await safePath(workspace,path);await mkdir(dirname(target),{recursive:true});await writeFile(target,content);return {path,version:hash(content),written:true};};
  const tools=workspaceTools({workspace,artifactsDir:join(runDir,'artifacts'),signal,log}).filter(t=>!['file_edit','file_write','test'].includes(t.name));
  tools.push(
    make('file_write','Write a complete UTF-8 workspace file. Original tests and runner configuration are protected.',Type.Object({path:Type.String(),content:Type.String()}),args=>mutate(()=>write(args.path,args.content))),
    make('file_edit','Replace one exact unique occurrence in a workspace file. Original tests and runner configuration are protected.',Type.Object({path:Type.String(),oldText:Type.String({minLength:1}),newText:Type.String()}),args=>mutate(async()=>{const old=await readFile(await safePath(workspace,args.path),'utf8');if(old.split(args.oldText).length!==2)throw Error('oldText must match exactly once');return {...await write(args.path,old.replace(args.oldText,args.newText)),edited:true};})),
    make('test','Run the caller public checks. Optional id selects one check. No private evaluator is available.',Type.Object({id:Type.Optional(Type.String())}),async({id})=>{
      const selected=id?checks.filter(c=>c.id===id):checks;if(!selected.length)throw Error('No matching public checks');const outcomes=[];
      for(const check of selected){signal.throwIfAborted();outcomes.push(await runPublicCheck({workspace,check,timeoutMs:check.timeoutMs??60000,signal}));}
      return {status:outcomes.every(c=>c.status==='passed')?'passed':outcomes.some(c=>c.status==='failed')?'failed':'unverified',tests:outcomes.reduce((n,c)=>n+(c.tests??0),0),stdout:outcomes.map(c=>`${c.id}: ${c.output}`).join('\n'),checks:outcomes};
    }),
    make('exec','Run an argv command in the workspace for builds, tests or development. No shell interpolation. This is local execution, not an OS sandbox.',Type.Object({command:Type.Array(Type.String()),timeoutMs:Type.Optional(Type.Integer({minimum:1,maximum:60000}))}),async({command,timeoutMs=30000})=>{
      const argv=validateCommand(command),env={};for(const key of ['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','HOME','COMSPEC','PATHEXT'])if(process.env[key])env[key]=process.env[key];
      const out=await runProcess(argv[0],argv.slice(1),{cwd:workspace,env,timeoutMs,maxBytes:1000000,signal});
      return {exitCode:out.exitCode,timedOut:out.timedOut,overflow:out.overflow,error:out.error,stdout:out.stdout.slice(-12000),stderr:out.stderr.slice(-3000)};
    }),
    ...createNavigation({workspace,log,includeTypeScript:true})
  );
  return observationTools({tools,compact:compactResponses,directory:join(runDir,'observations'),log});
}
