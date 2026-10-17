// Zero-model selector-validity check: apply every subset of a task's reference patches and report which
// checks (visible, each acceptance test) can tell partial fixes from the full fix. Usage: node scripts/mutant-matrix.mjs lru-flight
import {mkdtemp,cp,rm,readFile,writeFile,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {tasks} from '../benchmarks/tasks.mjs';
import {runNodeTests} from '../src/workspace.mjs';

const tapNames=out=>({pass:[...out.matchAll(/^ok \d+ - (.*)$/gm)].map(m=>m[1]),fail:[...out.matchAll(/^not ok \d+ - (.*)$/gm)].map(m=>m[1])});
export async function mutantMatrix(task){
  const patches=JSON.parse(await readFile(task.referencePatchPath,'utf8')),rows=[];
  for(let mask=0;mask<1<<patches.length;mask++){
    const dir=await realpath(await mkdtemp(join(tmpdir(),'mutant-')));
    try{
      await cp(task.workspaceDir,dir,{recursive:true});
      for(const [i,p] of patches.entries()){
        if(!(mask>>i&1))continue;
        const f=join(dir,p.file),src=await readFile(f,'utf8');
        if(src.split(p.old).length!==2)throw new Error(`patch ${i} does not apply alone in subset ${mask}`);
        await writeFile(f,src.replace(p.old,p.new));
      }
      const vis=await runNodeTests(dir,join(dir,'tests/visible.test.mjs')),acc=await runNodeTests(dir,task.acceptancePath);
      rows.push({fixed:patches.map((_,i)=>mask>>i&1),visible:vis.status,acceptance:acc.status,failingTests:tapNames(acc.stdout).fail});
    }finally{await rm(dir,{recursive:true,force:true});}
  }
  return rows;
}
if(import.meta.url===`file://${process.argv[1]}`){
  const task=tasks.find(t=>t.id===process.argv[2]);if(!task)throw new Error('Unknown task id');
  const rows=await mutantMatrix(task);
  for(const r of rows)console.log(r.fixed.join(''),`visible=${r.visible}`,`acceptance=${r.acceptance}`,r.failingTests.length?`fails: ${r.failingTests.join(' | ')}`:'');
  const bad=rows.filter(r=>r.acceptance!=='passed');
  console.log(JSON.stringify({mutants:rows.length,visiblePassesOnBrokenMutants:bad.filter(r=>r.visible==='passed').length,brokenMutants:bad.length}));
}
