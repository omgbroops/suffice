import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {parseHunks} from '../shared/diff-hunks.mjs';
const run=promisify(execFile);
export {parseHunks};
// One hunk as a standalone patch: the file header plus that hunk.
export function hunkPatch({header,hunks},hunkId){
 const hunk=hunks.find(item=>item.id===hunkId);if(!hunk)throw new Error('This change is no longer in the file');
 return header.join('\n')+'\n'+hunk.head+'\n'+hunk.lines.join('\n')+'\n';
}
// Reverse-applies one hunk to the working tree through a temp patch. Other hunks are untouched; git fails
// (and writes nothing) when the file moved under the hunk.
export async function rejectHunk(cwd,diffText,hunkId){
 const parsed=parseHunks(diffText),patch=hunkPatch(parsed,hunkId),dir=await mkdtemp(resolve(tmpdir(),'suffice-hunk-')),file=resolve(dir,'hunk.patch');
 try{
  await writeFile(file,patch);
  try{await run('git',['-C',cwd,'apply','-R','--whitespace=nowarn',file],{windowsHide:true,timeout:30000});}
  catch(error){throw new Error('Could not restore this change: '+String(error.stderr||error.message).trim().split('\n')[0]);}
  return {remaining:parsed.hunks.length-1};
 }finally{await rm(dir,{recursive:true,force:true});}
}
