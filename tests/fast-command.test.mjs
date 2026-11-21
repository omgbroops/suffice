import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {listFiles,changedFiles,applyPatch,workspacePrefill} from '../packages/cli/src/fast-command.mjs';

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
  const base=await makeTree(),attempt=await makeTree();
  try{
    await writeFile(join(attempt,'src','a.js'),'export const a=42;');
    await rm(join(attempt,'src','b.js'));
    await mkdir(join(attempt,'src','new'),{recursive:true});
    await writeFile(join(attempt,'src','new','c.js'),'export const c=3;');
    const n=await applyPatch(base,attempt);
    assert.equal(n,3);
    assert.equal(await readFile(join(base,'src','a.js'),'utf8'),'export const a=42;');
    assert.equal(existsSync(join(base,'src','b.js')),false);
    assert.equal(await readFile(join(base,'src','new','c.js'),'utf8'),'export const c=3;');
  }finally{await rm(base,{recursive:true,force:true});await rm(attempt,{recursive:true,force:true});}
});

test('changedFiles reports no diff on identical trees',async()=>{
  const base=await makeTree(),attempt=await makeTree();
  try{
    const {changed,deleted}=await changedFiles(base,attempt);
    assert.equal(changed.length,0);
    assert.equal(deleted.length,0);
  }finally{await rm(base,{recursive:true,force:true});await rm(attempt,{recursive:true,force:true});}
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
