import {resolve} from 'node:path';
import {existsSync,readdirSync} from 'node:fs';
export function sufficeProjectExtensions(cwd,trusted){
 const dir=resolve(cwd,'.suffice','extensions');if(!trusted||!existsSync(dir))return [];
 return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
  if(entry.isFile()&&/\.(?:[cm]?js|[cm]?ts)$/.test(entry.name))return [resolve(dir,entry.name)];
  if(entry.isDirectory()){const index=['index.ts','index.js','index.mjs','index.cjs'].map(name=>resolve(dir,entry.name,name)).find(existsSync);if(index)return [index];}return [];
 });
}
export function filterSufficeResources(resources,home){
 const result={...resources};
 for(const kind of ['extensions','skills','prompts','themes'])result[kind]=(resources[kind]||[]).filter(item=>item.metadata?.source!=='auto'||resolve(item.metadata.baseDir||'')===resolve(home));
 return result;
}
export function isolateSufficeResourceLoader(loader,home){
 // The pinned SDK constructs its own manager; it does not accept one in options.
 const manager=loader.packageManager;
 if(!manager?.resolve)throw new Error('Unsupported resource loader: review Suffice resource isolation for this engine version.');
 const resolveResources=manager.resolve.bind(manager);
 manager.resolve=async()=>filterSufficeResources(await resolveResources(async()=> 'skip'),home);
 return loader;
}
