import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink,lstat} from 'node:fs/promises';
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

test('applyPatch removes a linked dir without touching its target',async()=>{
  const snapshot=await makeTree(),base=await makeTree(),attempt=await makeTree(),target=await mkdtemp(join(tmpdir(),'fast-cmd-target-'));
  try{
    // base has src -> <external target>; snapshot/attempt have the dereferenced real dir.
    await rm(join(base,'src'),{recursive:true});
    await mkdir(join(target,'src'),{recursive:true});
    await writeFile(join(target,'src','a.js'),'export const a=1;');
    await writeFile(join(target,'src','b.js'),'export const b=2;');
    await symlink(join(target,'src'),join(base,'src'),'dir');
    // Winner deletes the whole dir.
    await rm(join(attempt,'src'),{recursive:true});
    await applyPatch(base,snapshot,attempt);
    const st=await lstat(join(base,'src')).catch(()=>null);
    assert.equal(st,null);
    assert.equal(await readFile(join(target,'src','a.js'),'utf8'),'export const a=1;');
  }finally{for(const d of [snapshot,base,attempt,target]) await rm(d,{recursive:true,force:true});}
});

test('applyPatch materializes a linked dir before writing through it',async()=>{
  const snapshot=await makeTree(),base=await makeTree(),attempt=await makeTree(),target=await mkdtemp(join(tmpdir(),'fast-cmd-target-'));
  try{
    await rm(join(base,'src'),{recursive:true});
    await mkdir(join(target,'src'),{recursive:true});
    await writeFile(join(target,'src','a.js'),'export const a=1;');
    await writeFile(join(target,'src','b.js'),'export const b=2;');
    await symlink(join(target,'src'),join(base,'src'),'dir');
    // A live sibling edit under the link (made after the race started) must survive.
    await writeFile(join(target,'src','b.js'),'export const b="live";');
    await writeFile(join(attempt,'src','a.js'),'export const a=99;');
    await applyPatch(base,snapshot,attempt);
    const st=await lstat(join(base,'src'));
    assert.equal(st.isSymbolicLink(),false);
    assert.equal(await readFile(join(base,'src','a.js'),'utf8'),'export const a=99;');
    assert.equal(await readFile(join(base,'src','b.js'),'utf8'),'export const b="live";');
    // Target untouched.
    assert.equal(await readFile(join(target,'src','a.js'),'utf8'),'export const a=1;');
  }finally{for(const d of [snapshot,base,attempt,target]) await rm(d,{recursive:true,force:true});}
});

test('applyPatch materializes a linked dir containing dangling links',async()=>{
  const snapshot=await makeTree(),base=await makeTree(),attempt=await makeTree(),target=await mkdtemp(join(tmpdir(),'fast-cmd-target-'));
  try{
    await rm(join(base,'src'),{recursive:true});
    await mkdir(join(target,'src'),{recursive:true});
    await writeFile(join(target,'src','a.js'),'export const a=1;');
    await writeFile(join(target,'src','b.js'),'export const b=2;');
    await symlink(join(target,'missing.js'),join(target,'src','dep.js')); // dangling
    await symlink(join(target,'src'),join(base,'src'),'dir');
    await writeFile(join(attempt,'src','a.js'),'export const a=99;');
    await applyPatch(base,snapshot,attempt);
    const st=await lstat(join(base,'src'));
    assert.equal(st.isSymbolicLink(),false);
    assert.equal(await readFile(join(base,'src','a.js'),'utf8'),'export const a=99;');
    // Nested dangling link survives as a link, still dangling — no throw.
    const nested=await lstat(join(base,'src','dep.js'));
    assert.equal(nested.isSymbolicLink(),true);
    assert.equal(await readFile(join(target,'src','a.js'),'utf8'),'export const a=1;');
  }finally{for(const d of [snapshot,base,attempt,target]) await rm(d,{recursive:true,force:true});}
});

test('applyPatch materializes nested and file-level links before writing',async()=>{
  const snapshot=await makeTree(),base=await makeTree(),attempt=await makeTree(),target=await mkdtemp(join(tmpdir(),'fast-cmd-target-'));
  try{
    await rm(join(base,'src'),{recursive:true});
    await mkdir(join(target,'src'),{recursive:true});
    await writeFile(join(target,'src','a.js'),'export const a=1;');
    await writeFile(join(target,'src','b.js'),'export const b=2;');
    // File-level link nested inside the linked dir; winner edits it.
    await mkdir(join(target,'shared'),{recursive:true});
    await writeFile(join(target,'shared','dep.js'),'export const dep=1;');
    await symlink(join(target,'shared','dep.js'),join(target,'src','dep.js'));
    await symlink(join(target,'src'),join(base,'src'),'dir');
    await writeFile(join(attempt,'src','dep.js'),'export const dep=99;');
    await applyPatch(base,snapshot,attempt);
    // dep.js in base is now a real private file, not a link to shared/.
    const st=await lstat(join(base,'src','dep.js'));
    assert.equal(st.isSymbolicLink(),false);
    assert.equal(await readFile(join(base,'src','dep.js'),'utf8'),'export const dep=99;');
    // Shared target untouched.
    assert.equal(await readFile(join(target,'shared','dep.js'),'utf8'),'export const dep=1;');
  }finally{for(const d of [snapshot,base,attempt,target]) await rm(d,{recursive:true,force:true});}
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
