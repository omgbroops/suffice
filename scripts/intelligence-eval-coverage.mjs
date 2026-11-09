import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {suite,suiteRoot} from '../benchmarks/intelligence-eval-v2/tasks.mjs';
import {createIntelligence} from '../packages/cli/src/intelligence/graph.mjs';
// Offline explanatory covariate only. Never fed to agents or controller rules.
const validated=JSON.parse(await readFile(resolve(suiteRoot,'dataset.json'),'utf8')),rows=[];
for(const task of suite){
  const production=new Set(validated.find(t=>t.id===task.id).sourceFiles),graph=await createIntelligence({workspace:task.baseline}).snapshot();
  const resolved=graph.edges.filter(e=>e.kind==='module'&&production.has(e.evidence.path)&&e.specifier.startsWith('.'));
  const unresolved=graph.unresolved.filter(e=>e.kind==='module'&&production.has(e.evidence.path)&&typeof e.specifier==='string'&&e.specifier.startsWith('.'));
  const total=resolved.length+unresolved.length;
  const row={task:task.id,kind:task.kind,repository:task.repository,category:task.category,productionFiles:production.size,resolvedRelativeModuleEdges:resolved.length,unresolvedRelativeModuleReferences:unresolved.length,relativeModuleResolutionFraction:total?resolved.length/total:null,parseErrors:graph.files.filter(f=>production.has(f.path)&&f.error),unresolvedReasons:Object.fromEntries([...new Set(unresolved.map(e=>e.reason))].map(reason=>[reason,unresolved.filter(e=>e.reason===reason).length])),scope:'Syntactically recognized relative production module references only; no dynamic/runtime accuracy or coverage guarantee.'};
  rows.push(row);console.log(JSON.stringify({task:task.id,resolved:resolved.length,unresolved:unresolved.length}));
}
await writeFile(resolve(import.meta.dirname,'../reports/repository-intelligence-eval-v2/coverage.json'),JSON.stringify(rows,null,2));
