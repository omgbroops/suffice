import {realpath,stat} from 'node:fs/promises';
import {resolve,relative,dirname,isAbsolute,sep} from 'node:path';
import {createCodingTools} from '@earendil-works/pi-coding-agent';
import {createNavigation} from '../symbol-navigation.mjs';

export async function repositoryPath(workspace,path){
 if(typeof path!=='string'||!path||path.includes('\0'))throw new Error('A repository file path is required');
 const root=await realpath(workspace),target=resolve(root,path);
 const within=p=>{const r=relative(root,p);return r===''||(!isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+sep));};
 if(!within(target))throw new Error('Path is outside the authorized repository');
 let current=target;
 while(true){try{if(!within(await realpath(current)))throw new Error('Resolved path leaves the authorized repository');break;}catch(e){if(e.code!=='ENOENT')throw e;current=dirname(current);}}
 return target;
}

export function repositoryTools({workspace,signal,log=()=>{},commandTimeout=180}){
 const native=createCodingTools(workspace,{bash:{shellPath:'/bin/bash',exposeSessionEnvironment:false}});
 const tools=native.map(tool=>({...tool,label:tool.label??tool.name,
  async execute(id,args,toolSignal,onUpdate){
   if(signal?.aborted)throw new Error('Attempt stopped');
   if(tool.name!=='bash')await repositoryPath(workspace,args.path);
   if(tool.name==='bash')args={...args,timeout:Math.min(Math.max(args.timeout??commandTimeout,1),commandTimeout)};
   const start=performance.now();
   try{return await tool.execute(id,args,signal??toolSignal,onUpdate);}
   finally{log({type:'primitive',name:tool.name,latencyMs:performance.now()-start});}
  }}));
 // Reuse the existing parser/index unchanged. Bulk TypeScript discovery is enabled.
 const navigation=createNavigation({workspace,includeTypeScript:true,log}).map(tool=>({...tool,
  async execute(id,args){if(args.path)await repositoryPath(workspace,args.path);return tool.execute(id,args);}
 }));
 return [...tools,...navigation];
}
