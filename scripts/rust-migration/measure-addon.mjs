import {mkdtemp,mkdir,writeFile,readFile,open,rm} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
const sha=value=>createHash('sha256').update(value).digest('hex');
const args=process.argv.slice(2);
if(args[0]==='--child'){
 const [,fixture,baseline,candidate,binary,mode]=args;
 if(!fixture||!baseline||!candidate||!binary||!['baseline','addon'].includes(mode))throw new Error('Invalid child arguments');
 let walk;
 if(mode==='baseline')({filesIn:walk}=await import(pathToFileURL(join(baseline,'packages/cli/src/workspace.mjs')).href));
 else {const addon=createRequire(import.meta.url)(binary);const {createNativeFiles}=await import(pathToFileURL(join(candidate,'packages/cli/src/native-files.mjs')).href);walk=createNativeFiles({load:()=>addon});}
 const walks=[];let expected;
 for(let i=0;i<20;i++){const t=performance.now(),paths=await walk(fixture),wallMs=performance.now()-t;if(!Array.isArray(paths)||paths.length!==9600)throw new Error('Invalid or unavailable walk output');const outputSha256=sha(JSON.stringify(paths));if(expected===undefined)expected=outputSha256;else if(expected!==outputSha256)throw new Error('Output changed between walks');walks.push({wallMs,outputSha256,count:paths.length});}
 process.stdout.write(JSON.stringify({mode,node:process.version,walks,firstSha256:walks[0].outputSha256,lastSha256:walks.at(-1).outputSha256})+'\n');
}else{
 if(process.platform!=='win32'||args.length!==4)throw new Error('Usage on Windows: node measure-addon.mjs BASELINE_ROOT CANDIDATE_ROOT ADDON_BINARY NEW_OUTPUT.json');
 const [baseline,candidate,binary,output]=args.map(value=>resolve(value)),out=await open(output,'wx'),fixture=await mkdtemp(join(tmpdir(),'suffice-addon-memory-')),exec=promisify(execFile),ps=join(dirname(fileURLToPath(import.meta.url)),'measure-addon-memory.ps1');
 const result={schemaVersion:1,createdAt:new Date().toISOString(),node:process.version,nodePath:process.execPath,baseline,candidate,binary,method:{pairs:5,order:'alternating baseline/addon fresh Node processes',walksPerProcess:20,fixture:'600 directories and 9600 files, identical for all children',memory:'PROCESS_MEMORY_COUNTERS_EX peak working set and peak pagefile usage of whole Node child; additive comparison uses paired peak working set differences',cpu:'GetProcessTimes user plus kernel cumulative CPU of whole Node child',limitations:'JIT, GC, process startup, filesystem caches and sample variance affect results; independent process peaks need not coincide in time. This does not measure whole-app memory; no per-walk process is started.'},pairs:[],errors:[]};
 try{
  const addonBytes=await readFile(binary);result.addon={bytes:addonBytes.length,sha256:sha(addonBytes)};
  const manifest=[];for(let d=0;d<600;d++){const dir=`dir-${String(d).padStart(4,'0')}`;await mkdir(join(fixture,dir));const writes=[];for(let f=0;f<16;f++){const name=`file-${String(f).padStart(2,'0')}.txt`,content=`fixture ${d} ${f}\n`;manifest.push(`${dir}/${name}\0${sha(content)}`);writes.push(writeFile(join(fixture,dir,name),content));}await Promise.all(writes);}
  const actual=[];for(const row of manifest){const name=row.split('\0')[0];actual.push(`${name}\0${sha(await readFile(join(fixture,name)))}`);}assert.deepStrictEqual(actual,manifest);result.fixture={directories:600,files:9600,manifestSha256:sha(actual.join('\n')+'\n')};
  let globalHash;
  for(let i=0;i<5;i++){const order=i%2?['addon','baseline']:['baseline','addon'],pair={iteration:i+1,order};for(const mode of order){const {stdout,stderr}=await exec('pwsh',['-NoProfile','-NonInteractive','-File',ps,process.execPath,fixture,baseline,candidate,binary,mode],{timeout:130000,maxBuffer:2*1024*1024});if(stderr.trim())throw new Error(`PowerShell stderr: ${stderr}`);pair[mode]=JSON.parse(stdout);const child=pair[mode].child;assert.equal(child.node,process.version);assert.equal(child.walks.length,20);for(const walk of child.walks){if(globalHash===undefined)globalHash=walk.outputSha256;assert.equal(walk.outputSha256,globalHash,'Traversal output differs');}}
   pair.peakWorkingSetDifferenceBytes=pair.addon.peakWorkingSetBytes-pair.baseline.peakWorkingSetBytes;result.pairs.push(pair);
  }
  const differences=result.pairs.map(p=>p.peakWorkingSetDifferenceBytes).sort((a,b)=>a-b);result.gate={medianPairedIncreaseBytes:differences[2],thresholdBytes:16*1024*1024,pass:differences[2]<=16*1024*1024,criterion:'median of five paired whole-process peak working set differences'};
  if(!result.gate.pass)process.exitCode=2;
 }catch(e){result.errors.push(e.stack||String(e));process.exitCode=1;}finally{result.completedAt=new Date().toISOString();await out.writeFile(JSON.stringify(result,null,2)+'\n');await out.close();await rm(fixture,{recursive:true,force:true});}
}
