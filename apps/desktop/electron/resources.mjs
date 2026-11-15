import {mkdir,readFile,writeFile,rename,realpath} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
export function createResourceService(home,{choosePath}={}){
 let tail=Promise.resolve(),mutations=Promise.resolve();const children=new Set();
 const json=async file=>{try{return JSON.parse(await readFile(resolve(home,file),'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw e;}};
 const save=(file,value)=>{const job=tail.then(async()=>{await mkdir(home,{recursive:true});const target=resolve(home,file),temporary=target+'.'+randomUUID()+'.tmp';await writeFile(temporary,JSON.stringify(value,null,2),{mode:0o600});await rename(temporary,target);});tail=job.catch(()=>{});return job;};
 async function list(){
  const {SettingsManager,DefaultPackageManager,DefaultResourceLoader}=await import('@earendil-works/pi-coding-agent');
  const settings=SettingsManager.create(home,home),mcp=await json('mcp.json'),state=await json('resource-state.json');
  const manager=new DefaultPackageManager({cwd:home,agentDir:home,settingsManager:settings});
  // Inspection never installs a missing package or imports an extension.
  const resolved=await manager.resolve(async()=> 'skip');
  const loader=new DefaultResourceLoader({cwd:home,agentDir:home,settingsManager:settings,packageManager:{resolve:async()=>resolved,resolveExtensionSources:async()=>({extensions:[],skills:[],prompts:[],themes:[]})},noExtensions:true,noThemes:true,noContextFiles:true});
  await loader.reload();
  return {mcp:mcp.mcpServers||{},skills:loader.getSkills().skills.map(s=>({name:s.name,description:s.description,path:s.filePath,enabled:state.skills?.[s.name]!==false})),templates:loader.getPrompts().prompts.map(p=>({name:p.name,description:p.description,path:p.filePath,enabled:state.templates?.[p.name]!==false})),extensions:resolved.extensions.filter(e=>!e.path.startsWith('builtin:')).map(e=>({path:e.path,enabled:e.enabled,...e.metadata})),packages:settings.getSettings().packages||[],diagnostics:[...loader.getSkills().diagnostics,...loader.getPrompts().diagnostics],settings:settings.getSettings()};
 }
 async function action(p){if(!p||typeof p.action!=='string')throw new Error('Invalid resource action');
 if(p.action==='resource-toggle'){if(!['skills','templates'].includes(p.kind)||typeof p.name!=='string')throw new Error('Invalid resource');const state=await json('resource-state.json');state[p.kind]={...state[p.kind],[p.name]:p.enabled===true};await save('resource-state.json',state);return list();}
 if(p.action==='mcp-save'){const data=JSON.parse(p.text);if(!data.mcpServers||typeof data.mcpServers!=='object'||Array.isArray(data.mcpServers))throw new Error('Expected mcpServers object');for(const [name,server] of Object.entries(data.mcpServers)){if(!/^[a-zA-Z0-9_-]+$/.test(name)||!server||typeof server!=='object'||(!server.command&&!server.url))throw new Error('Each server needs a valid name and command or URL');if(server.args&&(!Array.isArray(server.args)||server.args.some(a=>typeof a!=='string')))throw new Error('Arguments must be a JSON array of strings');if(server.command&&typeof server.command!=='string')throw new Error('Command must be one executable');if(server.url&&!/^https?:\/\//.test(server.url))throw new Error('Expected an HTTP URL');}await save('mcp.json',data);return list();}
 if(p.action==='mcp-toggle'){const data=await json('mcp.json');if(!Object.hasOwn(data.mcpServers||{},p.name))throw new Error('Unknown server');data.mcpServers[p.name].enabled=p.enabled===true;await save('mcp.json',data);return list();}
 if(p.action==='write'){if(!['skills','templates'].includes(p.kind)||(!p.path&&!/^[a-zA-Z0-9_-]{1,80}$/.test(p.name))||typeof p.text!=='string'||p.text.length>200000)throw new Error('Use a short name with letters, numbers or dashes');let target;if(p.path){const items=await list(),entry=items[p.kind].find(x=>x.path===p.path);if(!entry)throw new Error('Unknown resource');target=await realpath(entry.path);}else{const dir=resolve(home,p.kind==='skills'?'skills/'+p.name:'prompts');await mkdir(dir,{recursive:true});target=join(dir,p.kind==='skills'?'SKILL.md':p.name+'.md');}await writeFile(target,p.text,{mode:0o600});return list();}
 if(p.action==='read'){const items=await list(),entry=[...items.skills,...items.templates].find(x=>x.path===p.path);if(!entry)throw new Error('Unknown resource');return readFile(await realpath(entry.path),'utf8');}
 if(p.action==='add-path'){if(!['skills','extensions','prompts'].includes(p.kind))throw new Error('Unknown resource type');const path=await choosePath(p.kind);if(!path)return list();const settings=await json('settings.json');settings[p.kind]=[...new Set([...(settings[p.kind]||[]),path])];await save('settings.json',settings);return list();}
 if(p.action==='extension-toggle'){
  const settings=await json('settings.json');if(typeof p.path!=='string')throw new Error('Invalid extension');
  const entry=(await list()).extensions.find(x=>x.path===p.path);if(!entry)throw new Error('Unknown extension');
  if(entry.origin==='package'){
   const index=(settings.packages||[]).findIndex(pkg=>{const source=typeof pkg==='string'?pkg:pkg.source;return source===entry.source||resolve(home,source)===entry.packageRoot;});
   if(index<0)throw new Error('Package configuration not found');
   const old=settings.packages[index],pkg=typeof old==='string'?{source:old}:{...old};const path=relative(entry.packageRoot,entry.path).replaceAll('\\','/');
   pkg.extensions=[...(pkg.extensions||[]).filter(x=>x!=='-'+path&&x!=='+'+path), (p.enabled?'+':'-')+path];settings.packages[index]=pkg;
  }else settings.extensions=[...(settings.extensions||[]).filter(x=>x!==p.path&&x!=='-'+p.path),p.enabled?p.path:'-'+p.path];
  await save('settings.json',settings);return list();
 }
 if(['install','update','remove'].includes(p.action)){if(typeof p.source!=='string'||p.source.length>1000||!p.source.trim())throw new Error('Enter a package source');const {SettingsManager,DefaultPackageManager}=await import('@earendil-works/pi-coding-agent');const settings=SettingsManager.create(home,home),manager=new DefaultPackageManager({cwd:home,agentDir:home,settingsManager:settings});if(p.action==='install')await manager.installAndPersist(p.source);if(p.action==='update')await manager.update(p.source);if(p.action==='remove')await manager.removeAndPersist(p.source);await settings.flush();return list();}
 if(['mcp-check','mcp-login','mcp-logout'].includes(p.action)){const args=p.action==='mcp-check'?['mcp','list']:['mcp',p.action==='mcp-login'?'login':'logout',p.name];if(p.name&&!/^[a-zA-Z0-9_-]+$/.test(p.name))throw new Error('Invalid server');const entry=(await import('node:url')).fileURLToPath(import.meta.resolve('@earendil-works/pi-coding-agent'));const cli=resolve(entry,'..','bundle','cli.js');return new Promise((resolveResult,reject)=>{const child=spawn(process.execPath,[cli,...args],{cwd:home,env:{...process.env,ELECTRON_RUN_AS_NODE:'1',PI_CODING_AGENT_DIR:home},windowsHide:true,stdio:['ignore','pipe','pipe']});children.add(child);child.once('close',()=>children.delete(child));let output='';const take=chunk=>{output=(output+chunk.toString()).slice(-60000);};child.stdout.on('data',take);child.stderr.on('data',take);child.on('error',error=>{clearTimeout(timer);reject(error);});const timer=setTimeout(()=>child.kill(),p.action==='mcp-login'?180000:30000);child.on('exit',code=>{clearTimeout(timer);resolveResult({output,ok:code===0});});});}
 throw new Error('Unknown resource action');}
 return {list,dispose(){for(const child of children)child.kill();children.clear();},action:payload=>{const job=mutations.then(()=>action(payload));mutations=job.catch(()=>{});return job;}};
}
