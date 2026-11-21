import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {listFiles,diffFiles,applyPatch,workspacePrefill} from '../packages/cli/src/fast-command.mjs';

async function makeTree(){
  const dir=await mkdtemp(join(tmpdir(),'fast-cmd-'));
  await mkdir(join(dir,'src'),{recursive:true});
  await mkdir(join(dir,'node_modules','dep'),{recursive:true});
  await writeFile(join(dir,'src','a.js'),'export const a=1;');
  await writeFile(join(dir,'src','b.js'),'export const b=2;');
  await writeFile(join(dir,'node_modules','dep','x.js'),'dep');
  return dir;
}

test('listFiles skips .git, node_modules and dot dirs',async()=>{
  const dir=await makeTree();
  try{
    const files=await listFiles(dir);
    assert.deepEqual(files.sort(),['src/a.js','src/b.js']);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('applyPatch copies changed and new files, removes deleted ones',async()=>{
  const snapshot=await makeTree(),base=await makeTree(),attempt=await makeTree();
  try{
    await writeFile(join(attempt,'src','a.js'),'export const a=42;');
    await rm(join(attempt,'src','b.js'));
    await mkdir(join(attempt,'src','new'),{recursive:true});
    await writeFile(join(attempt,'src','new','c.js'),'export const c=3;');
    const n=await applyPatch(base,snapshot,attempt);
    assert.equal(n,3);
    assert.equal(await readFile(join(base,'src','a.js'),'utf8'),'export const a=42;');
    assert.equal(existsSync(join(base,'src','b.js')),false);
    assert.equal(await readFile(join(base,'src','new','c.js'),'utf8'),'export const c=3;');
  }finally{for(const d of [snapshot,base,attempt]) await rm(d,{recursive:true,force:true});}
});

test('applyPatch preserves base edits made during the race',async()=>{
  const snapshot=await makeTree(),base=await makeTree(),attempt=await makeTree();
  try{
    // User edits b.js in the live tree mid-race; the winner only edits a.js.
    await writeFile(join(base,'src','b.js'),'export const b="user";');
    await writeFile(join(attempt,'src','a.js'),'export const a=42;');
    await applyPatch(base,snapshot,attempt);
    assert.equal(await readFile(join(base,'src','a.js'),'utf8'),'export const a=42;');
    assert.equal(await readFile(join(base,'src','b.js'),'utf8'),'export const b="user";');
  }finally{for(const d of [snapshot,base,attempt]) await rm(d,{recursive:true,force:true});}
});

test('diffFiles reports no diff on identical trees',async()=>{
  const from=await makeTree(),to=await makeTree();
  try{
    const {changed,deleted}=await diffFiles(from,to);
    assert.equal(changed.length,0);
    assert.equal(deleted.length,0);
  }finally{await rm(from,{recursive:true,force:true});await rm(to,{recursive:true,force:true});}
});

test('workspacePrefill lists files and the small-diff hint',async()=>{
  const dir=await makeTree();
  try{
    const prefill=await workspacePrefill(dir);
    assert.match(prefill,/Workspace layout \(2 files/);
    assert.match(prefill,/src\/a\.js/);
    assert.match(prefill,/smallest correct diff/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
