import {readFile, readdir, stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {nativeFiles} from './native-files.mjs';

export const hash=value=>createHash('sha256').update(value).digest('hex');
export async function repositoryPath(workspace, path) {
  if(typeof path!=='string' || !path || path.includes('\0')) throw new Error('A repository file path is required');
  // The project is a working directory, not a filesystem boundary.
  // Keep absolute paths and resolve relative paths using the selected project.
  return resolve(workspace,path);
}
export async function readText(root,path) {
  const target=await repositoryPath(root,path);
  if((await stat(target)).size>128*1024) throw new Error('Navigation file exceeds 128 KiB; use read with a range instead.');
  return readFile(target,'utf8');
}
export async function filesInJavaScript(root,directory='') {
  const entries=await readdir(resolve(root,directory),{withFileTypes:true}), result=[];
  for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))) {
    if(entry.name.startsWith('.') || entry.isSymbolicLink() || entry.name==='node_modules') continue;
    const path=[directory,entry.name].filter(Boolean).join('/');
    if(entry.isDirectory()) result.push(...await filesInJavaScript(root,path));
    else if(entry.isFile()) result.push(path);
  }
  return result;
}
export async function filesIn(root,directory='') {
  return await nativeFiles(root,directory) ?? filesInJavaScript(root,directory);
}
