import {readFile, readdir, realpath, stat} from 'node:fs/promises';
import {resolve, relative, isAbsolute, dirname, sep} from 'node:path';
import {createHash} from 'node:crypto';

export const hash=value=>createHash('sha256').update(value).digest('hex');
export async function repositoryPath(workspace, path) {
  if(typeof path!=='string' || !path || path.includes('\0')) throw new Error('A repository file path is required');
  const logicalRoot=resolve(workspace),root=await realpath(logicalRoot),logicalTarget=resolve(logicalRoot,path),suffix=relative(logicalRoot,logicalTarget);
  const insideLogical=suffix===''||(!isAbsolute(suffix)&&suffix!=='..'&&!suffix.startsWith('..'+sep));
  const target=insideLogical?resolve(root,suffix):logicalTarget;
  const within=p=>{const r=relative(root,p);return r==='' || (!isAbsolute(r) && r!=='..' && !r.startsWith('..'+sep));};
  if(!within(target)) throw new Error('Path is outside the authorized repository');
  let current=target;
  while(true) {
    try { if(!within(await realpath(current))) throw new Error('Resolved path leaves the authorized repository'); break; }
    catch(e) { if(e.code!=='ENOENT') throw e; current=dirname(current); }
  }
  return target;
}
export async function readText(root,path) {
  const target=await repositoryPath(root,path);
  if((await stat(target)).size>128*1024) throw new Error('Navigation file exceeds 128 KiB; use read with a range instead.');
  return readFile(target,'utf8');
}
export async function filesIn(root,directory='') {
  const entries=await readdir(resolve(root,directory),{withFileTypes:true}), result=[];
  for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))) {
    if(entry.name.startsWith('.') || entry.isSymbolicLink() || entry.name==='node_modules') continue;
    const path=[directory,entry.name].filter(Boolean).join('/');
    if(entry.isDirectory()) result.push(...await filesIn(root,path));
    else if(entry.isFile()) result.push(path);
  }
  return result;
}
