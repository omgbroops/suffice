import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {SemanticGraph} from '../packages/cli/src/semantic/graph.mjs';
import {semanticTasks,semanticReportDirectory} from '../benchmarks/semantic/tasks.mjs';

const root=await mkdtemp(resolve(tmpdir(),'suffice-semantic-measure-')),generated={
  'core.ts':'export function target(x: number): number { return x + 1; }',
  'bridge.ts':'import {target as alias} from "./core.js"; export function middle() { const value = alias(1); return value; }',
  'client.ts':'import {middle} from "./bridge.js"; export function entry() { return middle(); }',
  'other.ts':'export function target() { return 10; }',
  'shadow.ts':'export function work() { function target() { return 2; } return target(); }',
  'tests/entry.test.ts':'import {entry} from "../client.js"; export function testCase() { return entry(); }',
};
for(let i=0;i<60;i++)generated[`independent/module-${i}.ts`]=`export function independent${i}(value: number) { return value + ${i}; }`;
const put=async(path,text)=>{await mkdir(dirname(resolve(root,path)),{recursive:true});await writeFile(resolve(root,path),text);};
const find=(graph,name,path)=>{const matches=graph.symbols({query:name,path,limit:80}).matches.filter(n=>n.name===name);if(matches.length!==1)throw new Error('Ambiguous fixture symbol');return matches[0].id;};
let graph;
try {
  for(const [path,text]of Object.entries(generated))await put(path,text);
  graph=new SemanticGraph(root);const before=process.memoryUsage(),start=performance.now();graph.refresh();const initial=graph.lastUpdate;
  const target=find(graph,'target','core.ts'),middle=find(graph,'middle','bridge.ts'),entry=find(graph,'entry','client.ts'),testCase=find(graph,'testCase','tests/entry.test.ts'),work=find(graph,'work','shadow.ts'),localTarget=find(graph,'target','shadow.ts');
  const analysis=graph.allAnalysis(),expected=new Set([`${middle}->${target}`,`${entry}->${middle}`,`${testCase}->${entry}`,`${work}->${localTarget}`]);
  const actual=new Set(analysis.edges.filter(e=>e.kind==='calls').map(e=>`${e.from}->${e.to}`));
  const falsePositives=[...actual].filter(e=>!expected.has(e)),falseNegatives=[...expected].filter(e=>!actual.has(e));
  const impact=graph.impact({symbol:target,change:'signature',depth:5,limit:80}),affected=new Set(impact.affected.map(m=>m.symbol.id));
  const impactTruth=[middle,entry,testCase],tests=graph.affectedTests({symbols:[target]}),selected=[...tests.direct,...tests.inferred].map(t=>t.path);
  const firstQueriesWallMs=performance.now()-start,unrelated=graph.cache.get(resolve(root,'other.ts'));
  await put('core.ts',generated['core.ts'].replace('x + 1','x + 2'));graph.refresh();const dependentUpdate=graph.lastUpdate;
  const dependentValid=dependentUpdate.invalidated.includes('bridge.ts')&&dependentUpdate.invalidated.includes('client.ts')&&dependentUpdate.invalidated.includes('tests/entry.test.ts')&&graph.cache.get(resolve(root,'other.ts'))===unrelated;
  graph.allAnalysis();await put('other.ts',generated['other.ts'].replace('10','11'));graph.refresh();const unrelatedUpdate=graph.lastUpdate;
  const staleFailures=Number(!dependentValid)+Number(unrelatedUpdate.invalidated.length!==1);
  const measured={fixture:{files:Object.keys(generated).length,initial,firstQueriesWallMs,heapDeltaBytes:process.memoryUsage().heapUsed-before.heapUsed,dependentUpdate,unrelatedUpdate},
    quality:{scope:'Four enumerated direct call relationships, three impacted functions and one known relevant test in a deterministic fixture; not a production recall estimate.',expectedCalls:expected.size,resolvedCalls:actual.size,truePositives:[...actual].filter(e=>expected.has(e)).length,falsePositives,falseNegatives,impactExpected:impactTruth.length,impactFound:impactTruth.filter(id=>affected.has(id)).length,knownRelevantTests:1,selectedRelevantTests:Number(selected.includes('tests/entry.test.ts')),invalidationFailures:staleFailures},repositories:[]};
  graph.dispose();graph=null;
  for(const task of semanticTasks){const g=new SemanticGraph(task.workspaceDir),start=performance.now(),before=process.memoryUsage();g.refresh();const indexed=performance.now();g.allAnalysis();measured.repositories.push({task:task.id,files:g.files.size,indexingMs:indexed-start,lazyAnalysisMs:performance.now()-indexed,inputBytes:g.inputBytes,nodes:g.nodes.size,edges:g.lastLookup.edges,unresolved:g.lastLookup.unresolved,limits:g.state(),heapBefore:before.heapUsed,heapAfter:process.memoryUsage().heapUsed,rssAfter:process.memoryUsage().rss});g.dispose();}
  measured.sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();measured.node=process.version;measured.at=new Date().toISOString();measured.memoryCaveat='Same-process observed heap/RSS and deltas include compiler/runtime allocation and garbage collection; these are not isolated peak memory measurements.';
  await mkdir(semanticReportDirectory,{recursive:true});await writeFile(resolve(semanticReportDirectory,'microbenchmark.json'),JSON.stringify(measured,null,2));console.log(JSON.stringify(measured,null,2));
  if(falsePositives.length||falseNegatives.length||staleFailures||measured.quality.impactFound!==3||measured.quality.selectedRelevantTests!==1)process.exitCode=1;
} finally {graph?.dispose();if(dirname(root)!==resolve(tmpdir())||!root.startsWith(resolve(tmpdir(),'suffice-semantic-measure-')))throw new Error('Unexpected cleanup target');await rm(root,{recursive:true,force:true});}
