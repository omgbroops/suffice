import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute} from 'node:path';
import {copySource} from '../src/native-intelligence-eval.mjs';
import {initializeWorkspaceGit} from '../src/intelligence-eval.mjs';
import {createIntelligence} from '../packages/cli/src/intelligence/graph.mjs';
import {hash} from '../src/workspace.mjs';
const root=process.cwd(),published=resolve(root,'reports/repository-intelligence-eval-v2/svelte-native-pilot'),runId='sveltejs__svelte-1190-B-r0';
const original=JSON.parse(await readFile(resolve(published,runId+'.json'),'utf8'));
const workspace=resolve(root,'.suffice/intelligence-svelte-pilot/payload-replay-'+Date.now());await mkdir(workspace,{recursive:true});
await copySource(resolve(root,'.suffice/intelligence-svelte-pilot/baseline'),workspace);await initializeWorkspaceGit(workspace);
const engine=createIntelligence({workspace}),start=performance.now();await engine.begin();const baselineMs=performance.now()-start;
for(const patch of original.patches){
  const target=resolve(workspace,patch.path),within=relative(workspace,target);
  if(within==='..'||within.startsWith('..\\')||within.startsWith('../')||isAbsolute(within))throw new Error('Patch escapes replay workspace');
  if(patch.after===null)await unlink(target);else{await mkdir(dirname(target),{recursive:true});await writeFile(target,patch.after);}
}
const impact=await engine.get_impact_analysis({limit:12}),tests=await engine.get_relevant_tests({limit:12}),after={impact,tests};
const events=(await readFile(resolve(published,runId+'.events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
const prior=events.filter(e=>e.type==='graph_guidance'&&e.data.impact).at(-1).data;
const inputs={};for(const p of ['packages/cli/src/intelligence/graph.mjs','packages/cli/src/intelligence/source-files.mjs','packages/cli/src/intelligence/on-demand.mjs','packages/cli/src/intelligence/tools.mjs'])inputs[p]=hash(await readFile(resolve(root,p)));
const report={kind:'offline-payload-replay-no-inference',runId,inputs,original:{bytes:Buffer.byteLength(JSON.stringify(prior)),changedFiles:prior.impact.changedFiles.length,changedSymbols:prior.impact.changedSymbols.length},bounded:{bytes:Buffer.byteLength(JSON.stringify(after)),changedFiles:impact.changedFiles.length,changedSymbols:impact.changedSymbols.length,total:impact.total,page:impact.page,fileSelection:impact.coverage.fileSelection},baselineMs,refresh:impact.metrics,data:after,limitations:['Same recorded final edits/artifacts replayed from pristine input; no new model attempt or acceptance score.','Original last guidance and replay are views at different graph scopes: ignored untracked outputs are now excluded.','Bytes are measured serialized evidence, not tokens or a measured reduction in model cost.','Single replay timings do not establish a performance effect.']};
await writeFile(resolve(root,'reports/repository-intelligence-eval-v2/payload-replay.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,data:undefined}));
