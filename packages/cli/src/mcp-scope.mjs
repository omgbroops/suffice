import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
// Built-in toolkits: the tool names each switch controls.
export const TOOLKITS={
 files:{title:'Files',detail:'Read, edit and write files',tools:['read','edit','write']},
 shell:{title:'Shell',detail:'Run commands in the project',tools:['bash','powershell']},
 navigation:{title:'Code navigation',detail:'Find symbols and references',tools:['symbols','symbol_read','symbol_references']},
 web:{title:'Web',detail:'Search and fetch pages, loaded on demand',tools:['web_search','fetch_content','get_search_content']}
};
// Same formula as the desktop's thread ids (apps/desktop/electron/threads.mjs).
export const threadKey=path=>createHash('sha256').update(process.platform==='win32'?resolve(path).toLowerCase():resolve(path)).digest('hex').slice(0,32);
export const projectKey=path=>process.platform==='win32'?resolve(path).toLowerCase():resolve(path);
export function readScope(home){try{return JSON.parse(readFileSync(resolve(home,'mcp-scope.json'),'utf8'));}catch{return {};}}
// Overrides layer thread > project > everywhere > the server's own enabled flag. level 'project'/'global' ignores the layers above it.
export function scopeLookup(scope,{project,thread,level='thread'}){
 const layers=[];if(level==='thread'&&thread)layers.push(['thread',scope.threads?.[thread]]);if(level!=='global'&&project)layers.push(['project',scope.projects?.[project]]);layers.push(['global',scope.global]);
 return key=>{for(const [source,layer] of layers)if(typeof layer?.[key]==='boolean')return {enabled:layer[key],source};return null;};
}
export function mcpScope(home,cwd,sessionFile){
 const lookup=scopeLookup(readScope(home),{project:cwd&&projectKey(cwd),thread:sessionFile&&threadKey(sessionFile)});
 const on=(key,base=true)=>lookup(key)?.enabled??base;
 return {on,override:key=>lookup(key)?.enabled,toolkit:id=>on('toolkit:'+id),tool(name){const id=Object.keys(TOOLKITS).find(k=>TOOLKITS[k].tools.includes(name));return !id||on('toolkit:'+id);}};
}
