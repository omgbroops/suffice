import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const allowed=new Set(['web_search','fetch_content','get_search_content']);
// Keep the product surface small even if the upstream extension adds tools.
export function deferredWebExtension(extension){
 return pi=>extension(new Proxy(pi,{get(target,key){
  if(key==='registerTool')return tool=>{if(allowed.has(tool.name))target.registerTool({...tool,exposure:'deferred'});};
  if(key==='registerCommand'||key==='registerShortcut')return ()=>{};
  if(key==='setActiveTools')return names=>target.setActiveTools(names.filter(name=>!allowed.has(name)&&name!=='web_enable'));
  return Reflect.get(target,key);
 }}));
}
export async function loadWebExtension(home){
 await mkdir(home,{recursive:true});const file=resolve(home,'web-search.json');
 let config;try{config=JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 if(!config)await writeFile(file,JSON.stringify({toolExposure:'deferred',toolActivation:'none',tools:{sourceCheck:{enabled:false}},commands:{websearch:{enabled:false},curator:{enabled:false},search:{enabled:false},'google-account':{enabled:false}},image:{enabled:false},pdf:{enabled:false}},null,2),{flag:'wx',mode:0o600}).catch(error=>{if(error.code!=='EEXIST')throw error;});
 process.env.PI_CODING_AGENT_DIR=home;
 const {default:extension}=await import('pi-web-access/dist/index.js');
 return deferredWebExtension(extension);
}
