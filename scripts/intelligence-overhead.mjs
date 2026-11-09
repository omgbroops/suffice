import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {createIntelligence} from '../packages/cli/src/intelligence/graph.mjs';

if(!global.gc)throw new Error('Run with node --expose-gc scripts/intelligence-overhead.mjs');
const workspace=resolve(import.meta.dirname,'..'),cacheDir=await mkdtemp(resolve(tmpdir(),'suffice-memory-'));
const output=resolve(process.argv[2]??'reports/repository-intelligence-v1/overhead.json');
try{
  global.gc();const before=process.memoryUsage(),engine=createIntelligence({workspace,cacheDir});
  const cold=await engine.snapshot();global.gc();const indexed=process.memoryUsage();
  const warm=await engine.snapshot();global.gc();const reused=process.memoryUsage();
  const report={node:process.versions.node,revision:warm.revision,files:warm.files.length,symbols:warm.symbols.length,relationships:warm.edges.length,unresolved:warm.unresolved.length,cold:cold.metrics,warm:warm.metrics,memory:{before,indexed,reused,retainedHeapDeltaBytes:reused.heapUsed-before.heapUsed,rssDeltaBytes:reused.rss-before.rss},limitations:['One process/one repository measurement, not a percentile or throughput study.','Explicit GC estimates retained heap; RSS includes allocator/runtime effects and is not attributable entirely to the graph.','Graph and cache serialized sizes measure payload, not total in-memory object overhead.','Two content scans per query are intentional freshness overhead; graph errors and unresolved coverage are separate from latency.']};
  await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await rm(cacheDir,{recursive:true,force:true});}
