import {mkdir,readFile,writeFile,cp} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import {suite,suiteRoot} from '../benchmarks/intelligence-eval-v2/tasks.mjs';
import {tasks as synthetic} from '../benchmarks/tasks.mjs';
import {applyReferencePatch} from '../benchmarks/verify-tasks.mjs';
import {filesIn,hash,runNodeTests} from '../src/workspace.mjs';
import {root} from '../src/runtime.mjs';

async function archive(repository,revision){
  const dir=resolve(suiteRoot,'upstream',repository.split('/')[1],revision),file=resolve(dir,'source.tar.gz');await mkdir(dir,{recursive:true});
  let bytes;try{bytes=await readFile(file);}catch(e){if(e.code!=='ENOENT')throw e;const r=await fetch(`https://codeload.github.com/${repository}/tar.gz/${revision}`,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw new Error(`Archive ${r.status}`);bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>4*1024**2)throw new Error('Archive over cap');await writeFile(file,bytes,{flag:'wx'});}
  const result=spawnSync('tar',['-xzf',file,'-C',dir],{windowsHide:true,encoding:'utf8'});if(result.status!==0)throw new Error(result.stderr);
  return {path:resolve(dir,repository.split('/')[1]+'-'+revision),archiveHash:hash(bytes),archiveBytes:bytes.length};
}
// Test files are wrapped in lexical blocks so composed suites cannot share bindings.
function compose(source,prefix,index){
  const rewritten=source.replaceAll('\r\n','\n').replaceAll("'src/",`'src/${prefix}/`).replaceAll('"src/',`"src/${prefix}/`).replaceAll("'../src/",`'../src/${prefix}/`).replaceAll('"../src/',`"../src/${prefix}/`)
    .replace(/\bimport\s+([^;]+?)\s+from\s+(['"])([^'"]+)\2\s*;/g,(_all,binding,_quote,path)=>{
      const pattern=binding.trim().startsWith('{')?binding.replace(/\bas\b/g,':'):`{default:${binding.trim()}}`;
      return `const ${pattern}=await import(${JSON.stringify(path)});`;
    });
  return {imports:[],body:`// Component ${index}: ${prefix}\n{\n${rewritten}\n}\n`};
}
const records=[];
for(const task of suite){
  if(process.argv.includes('--resume'))try{const prior=JSON.parse(await readFile(resolve(dirname(task.baseline),'validation.json'),'utf8'));if(prior.reference.status==='passed'&&prior.baseline.status==='failed'&&prior.regression.status==='passed'){records.push(prior);console.log(JSON.stringify({id:task.id,cached:true}));continue;}}catch(e){if(e.code!=='ENOENT')throw e;}
  await mkdir(task.baseline,{recursive:true});await mkdir(dirname(task.preparedAcceptance),{recursive:true});
  let referenceFiles=[],sourceReceipt=null;
  if(task.kind==='synthetic'){
    await cp(task.workspaceDir,task.baseline,{recursive:true});await cp(task.baseline,task.reference,{recursive:true});await applyReferencePatch(task,task.reference);
    await cp(task.acceptancePath,task.preparedAcceptance);referenceFiles=JSON.parse(await readFile(task.referencePatchPath,'utf8')).map(p=>p.file);
  }else if(task.kind==='compound'){
    const held=[],visible=[],contracts=[];
    for(const [index,id]of task.parts.entries()){
      const part=synthetic.find(t=>t.id===id),component=resolve(task.baseline,'src',id),ref=resolve(task.reference,'src',id);
      await mkdir(component,{recursive:true});await cp(resolve(part.workspaceDir,'src'),component,{recursive:true});
      await mkdir(ref,{recursive:true});await cp(part.workspaceDir,resolve(suiteRoot,'component-references',id),{recursive:true});
      const temporary=resolve(suiteRoot,'component-references',id);await applyReferencePatch(part,temporary);await cp(resolve(temporary,'src'),ref,{recursive:true});
      contracts.push(`## ${id}\nProduction source is under src/${id}/.\n${await readFile(resolve(part.workspaceDir,'README.md'),'utf8')}`);
      held.push(compose(await readFile(part.acceptancePath,'utf8'),id,index));
      visible.push(compose(await readFile(resolve(part.workspaceDir,'tests/visible.test.mjs'),'utf8'),id,index));
      referenceFiles.push(...JSON.parse(await readFile(part.referencePatchPath,'utf8')).map(p=>'src/'+id+'/'+p.file.slice(4)));
    }
    const combine=parts=>[...new Set(parts.flatMap(p=>p.imports))].join('\n')+'\n'+parts.map(p=>p.body).join('\n');
    for(const dir of [task.baseline,task.reference]){await mkdir(resolve(dir,'tests'),{recursive:true});await writeFile(resolve(dir,'tests/visible.test.mjs'),combine(visible));await writeFile(resolve(dir,'README.md'),`# Compound multi-stage repair: ${task.id}\n\nThis synthetic task composes independently specified subsystems, rather than claiming to be one upstream issue. All component contracts must pass. Public APIs are preserved independently, without introducing a new combined API.\n\n${contracts.join('\n\n')}`);}
    await writeFile(task.preparedAcceptance,combine(held));
  }else{
    sourceReceipt=await archive(task.repository,task.revision);await mkdir(resolve(task.baseline,'src'),{recursive:true});await cp(sourceReceipt.path,resolve(task.baseline,'src'),{recursive:true});
    await mkdir(resolve(task.baseline,'tests'),{recursive:true});const yaml=task.repository==='nodeca/js-yaml';
    await cp(resolve(root,yaml?'benchmarks/workflow/visible.test.mjs':'benchmarks/real/visible.test.mjs'),resolve(task.baseline,'tests/visible.test.mjs'));
    if(!yaml){const text=await readFile(resolve(task.baseline,'src/test/ranges/subset.js'),'utf8'),literal=text.match(/const cases = (\[[\s\S]*?\n\])/)[1];await writeFile(resolve(task.baseline,'tests/upstream-subset-cases.json'),JSON.stringify(runInNewContext(literal,{}, {timeout:1000})));}
    const originalPrompt=task.repository==='nodeca/js-yaml'?(await import('../benchmarks/workflow/tasks.mjs')).workflowTasks.find(t=>t.id===task.id).prompt:[...(await import('../benchmarks/real/tasks.mjs')).realTasks,...(await import('../benchmarks/efficiency/tasks.mjs')).efficiencyTasks].find(t=>t.id===task.id).prompt;
    await writeFile(resolve(task.baseline,'README.md'),`# ${task.repository} repair\n\n${originalPrompt}\n\nUpstream ${task.revision} is under src/. ${yaml?'Node 24 executes production TypeScript directly in src/src/.':'Production is in src/classes, src/functions, src/internal, src/ranges and src/index.js.'} Edit only existing production files; all upstream tests, fixtures, metadata and docs are immutable. No dependencies need installation. Run node --test tests/visible.test.mjs.\n`);
    await cp(task.baseline,task.reference,{recursive:true});
    referenceFiles=task.referenceFiles.map(p=>'src/'+p);
    for(const p of task.referenceFiles){const r=await fetch(`https://raw.githubusercontent.com/${task.repository}/${task.fix}/${p}`,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error('Reference download failed');await writeFile(resolve(task.reference,'src',p),await r.text());}
    await cp(task.acceptancePath,task.preparedAcceptance);
  }
  const baseline=await runNodeTests(task.baseline,task.preparedAcceptance),reference=await runNodeTests(task.reference,task.preparedAcceptance),regression=await runNodeTests(task.baseline,resolve(task.baseline,'tests/visible.test.mjs')),referenceRegression=await runNodeTests(task.reference,resolve(task.reference,'tests/visible.test.mjs'));
  const inventory=await filesIn(task.baseline),sourceFiles=task.kind==='upstream'?inventory.filter(p=>task.repository==='nodeca/js-yaml'?/^src\/src\/.*\.ts$/.test(p):/^src\/(classes|functions|internal|ranges)\/.*\.js$/.test(p)||['src/index.js','src/preload.js'].includes(p)):inventory.filter(p=>p.startsWith('src/'));
  const hashes={};for(const p of inventory)hashes[p]=hash(await readFile(resolve(task.baseline,p)));
  const record={id:task.id,kind:task.kind,repository:task.repository,revision:task.revision,fix:task.fix??null,category:task.category,family:task.family,parts:task.parts,difficultyRationale:task.difficultyRationale,issue:task.issue??null,sourceReceipt,sourceFiles,referenceFiles:[...new Set(referenceFiles)],hashes,acceptanceHash:hash(await readFile(task.preparedAcceptance)),baseline,reference,regression,referenceRegression};
  await writeFile(resolve(dirname(task.baseline),'validation.json'),JSON.stringify(record,null,2));
  console.log(JSON.stringify({id:task.id,baseline:baseline.status,reference:reference.status,regression:regression.status,referenceRegression:referenceRegression.status,files:sourceFiles.length}));
  if(baseline.status!=='failed'||!baseline.stdout.includes('ERR_ASSERTION')||reference.status!=='passed'||regression.status!=='passed'||referenceRegression.status!=='passed')throw new Error('Task validation failed: '+task.id);
  records.push(record);
}
await writeFile(resolve(suiteRoot,'dataset.json'),JSON.stringify(records,null,2));
