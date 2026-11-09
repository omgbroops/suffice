import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {performance} from 'node:perf_hooks';
import {cases} from '../benchmarks/intelligence/information.mjs';
import {createNavigation} from '../packages/cli/src/navigation.mjs';
import {createIntelligence} from '../packages/cli/src/intelligence/graph.mjs';
import {hash} from '../packages/cli/src/workspace.mjs';
import {workspaceTools} from '../src/workspace.mjs';

const score=(predicted,gold)=>{const p=new Set(predicted),g=new Set(gold),tp=[...p].filter(x=>g.has(x)).length;return {predicted:[...p].sort(),gold:[...g].sort(),tp,fp:p.size-tp,fn:g.size-tp,precision:p.size?tp/p.size:null,recall:g.size?tp/g.size:null};};
export async function measureInformation(){
  const root=await mkdtemp(resolve(tmpdir(),'suffice-info-')),rows=[];
  try{
    for(const c of cases){
      const workspace=resolve(root,c.id);await mkdir(workspace);
      for(const [path,source]of Object.entries(c.files))await writeFile(resolve(workspace,path),source);
      const tools=createNavigation({workspace}),start=performance.now();
      const refs=(await tools.find(t=>t.name==='symbol_references').execute('info',{name:c.target.name,limit:80})).structuredContent;
      const astMs=performance.now()-start;
      const searchStart=performance.now(),search=(await workspaceTools({workspace}).find(t=>t.name==='search').execute('search',{query:c.target.name})).structuredContent;
      const searchMs=performance.now()-searchStart,engine=createIntelligence({workspace,cacheDir:resolve(root,'cache')}),g=await engine.snapshot();
      const id=g.symbols.find(s=>s.path===c.target.path&&s.name===c.target.name).id;
      const predicted=g.edges.filter(e=>['reference','call','imports','exports'].includes(e.kind)&&e.to===id&&e.evidence.path!==c.target.path).map(e=>`${e.evidence.path}:${e.evidence.line}`);
      const warm=await engine.snapshot();
      rows.push({id:c.id,baseline:score(refs.references.filter(r=>r.path!==c.target.path).map(r=>`${r.path}:${r.line}`),c.gold),search:score(search.filter(r=>r.path!==c.target.path).map(r=>`${r.path}:${r.line}`),c.gold),graph:score(predicted,c.gold),astMs,searchMs,cold:g.metrics,warm:warm.metrics});
    }
    const totals=Object.fromEntries(['baseline','search','graph'].map(arm=>{const sum=k=>rows.reduce((n,r)=>n+r[arm][k],0),tp=sum('tp'),fp=sum('fp'),fn=sum('fn');return [arm,{tp,fp,fn,precision:tp/(tp+fp),recall:tp/(tp+fn)}];}));
    return {kind:'deterministic-binding-usage-retrieval',fixtureHash:hash(JSON.stringify(cases)),cases:rows,totals,limitations:['Four authored ESM microfixtures, not general repository accuracy.','Baseline tool explicitly offers syntactic candidates, not resolved bindings; this measures candidate filtering and alias recall, not a false exactness claim.','No model reasoning; a baseline agent could inspect candidates and resolve these manually.','No behavioral correctness inferred from static edges.']};
  }finally{await rm(root,{recursive:true,force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(import.meta.filename)){
  const output=resolve(process.argv[2]??'reports/repository-intelligence-v1/information.json');await mkdir(dirname(output),{recursive:true});
  const report=await measureInformation();
  // Include an actual repository cold/warm measurement, with cache outside the tree.
  const scratch=await mkdtemp(resolve(tmpdir(),'suffice-overhead-'));
  try{const engine=createIntelligence({workspace:resolve(import.meta.dirname,'..'),cacheDir:scratch}),cold=await engine.snapshot(),warm=await engine.snapshot();report.repository={revision:cold.revision,cold:cold.metrics,warm:warm.metrics,symbols:cold.symbols.length,edges:cold.edges.length,unresolved:cold.unresolved.length,unparsed:cold.files.filter(f=>f.error)};}finally{await rm(scratch,{recursive:true,force:true});}
  await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output,totals:report.totals,repository:report.repository}));
}
