import {readdir,realpath,stat,mkdir,copyFile} from 'node:fs/promises';
import {resolve,relative,dirname,sep} from 'node:path';
export async function sessionFiles(home){
 let root;try{root=await realpath(resolve(home,'sessions'));}catch(error){if(error.code==='ENOENT')return [];throw error;}const result=[];
 async function visit(folder){let entries;try{entries=await readdir(folder,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return;throw error;}for(const entry of entries){if(entry.isSymbolicLink())continue;const path=resolve(folder,entry.name);if(entry.isDirectory())await visit(path);else if(entry.isFile()&&entry.name.endsWith('.jsonl')){const real=await realpath(path);if(!real.startsWith(root+sep))throw new Error('Invalid session path');result.push({path:real,relative:relative(root,real),modified:(await stat(real)).mtimeMs});}}}
 await visit(root);return result;
}
export async function exportSessions(home,destination){if(resolve(destination)===resolve(home)||resolve(destination).startsWith(resolve(home)+sep))throw new Error('Choose a folder outside Suffice data');const files=await sessionFiles(home);const target=resolve(destination,'Suffice export '+new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(target,{recursive:true});for(const file of files){const output=resolve(target,file.relative);await mkdir(dirname(output),{recursive:true});await copyFile(file.path,output);}return {directory:target,count:files.length};}
export async function expireSessions(home,days,{trash,active=new Set(),now=Date.now()}){if(![30,90].includes(days))return 0;let count=0;for(const file of await sessionFiles(home)){if(file.modified<now-days*86400000&&!active.has(file.path)){await trash(file.path);count++;}}return count;}
