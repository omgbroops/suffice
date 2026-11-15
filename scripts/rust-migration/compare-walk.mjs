import {mkdtemp,mkdir,writeFile,rm,readFile,open} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){if(!['--root','--candidate','--output','--binary','--mode'].includes(args[i])||!args[i+1]||options[args[i]])throw new Error('Usage: node compare-walk.mjs --root BASELINE --candidate CURRENT --output NEW.json [--binary RELEASE_BINARY] [--mode addon|subprocess]');options[args[i]]=args[i+1];}
if(!options['--root']||!options['--candidate']||!options['--output'])throw new Error('Required: --root BASELINE --candidate CURRENT --output NEW.json');
const baselineRoot=resolve(options['--root']),candidateRoot=resolve(options['--candidate']),output=resolve(options['--output']);
const mode=options['--mode']||'addon';
if(!['addon','subprocess'].includes(mode))throw new Error('Invalid --mode');
const binary=resolve(options['--binary']||process.env.SUFFICE_NATIVE_FILES||join(candidateRoot,'packages/cli/native',`suffice-fs-${process.platform}-${process.arch}.node`));
const outputFile=await open(output,'wx');
const temp=await mkdtemp(join(tmpdir(),'suffice-walk-benchmark-'));
const result={schemaVersion:1,createdAt:new Date().toISOString(),node:process.version,platform:process.platform,arch:process.arch,baselineRoot,candidateRoot,binary,method:{warmupPairsPerFixture:2,measuredPairsPerFixture:20,order:'alternates baseline-first and candidate-first per pair',timing:'wall-clock around full filesIn or nativeFiles invocation, including child launch, JSON decoding and sorting',cache:'filesystem cache not flushed',memory:'not measured'},fixtures:{},errors:[]};
const digest=value=>createHash('sha256').update(value).digest('hex');
const summary=values=>{const sorted=[...values].sort((a,b)=>a-b),quantile=p=>{const index=(sorted.length-1)*p,lo=Math.floor(index),hi=Math.ceil(index);return sorted[lo]+(sorted[hi]-sorted[lo])*(index-lo);},mean=values.reduce((a,b)=>a+b,0)/values.length;return {median:quantile(.5),p10:quantile(.1),p90:quantile(.9),min:sorted[0],max:sorted.at(-1),mean,stddev:Math.sqrt(values.reduce((sum,x)=>sum+(x-mean)**2,0)/values.length)};};
try{
 const bytes=await readFile(binary);result.binaryBytes=bytes.length;result.binarySha256=digest(bytes);
 const {filesIn:baseline}=await import(pathToFileURL(join(baselineRoot,'packages/cli/src/workspace.mjs')).href);
 let candidate;
 if(mode==='addon'){
  const addon=createRequire(import.meta.url)(binary);
  const {createNativeFiles}=await import(pathToFileURL(join(candidateRoot,'packages/cli/src/native-files.mjs')).href);
  candidate=createNativeFiles({load:()=>addon});
 }else{
  const {nativeFiles}=await import(pathToFileURL(join(candidateRoot,'experiments/native-walk-rejected/native-files.mjs')).href);
  candidate=(root,directory)=>nativeFiles(root,directory,binary);
 }
 result.mode=mode;
 result.method.timing=mode==='addon'?'wall-clock around async Node-API walk including libuv scheduling, Rust traversal, result conversion and JS ordering':'wall-clock including process launch, traversal, JSON decoding and JS ordering';
 const fixtureSpecs=[{name:'small',dirs:1,filesPerDir:4},{name:'large',dirs:600,filesPerDir:16}];
 for(const spec of fixtureSpecs){
  const root=join(temp,spec.name);await mkdir(root);const records=[];
  for(let d=0;d<spec.dirs;d++){const dir=`dir-${String(d).padStart(4,'0')}`;await mkdir(join(root,dir));const writes=[];for(let f=0;f<spec.filesPerDir;f++){const file=`file-${String(f).padStart(2,'0')}.txt`,content=`fixture ${d} ${f}\n`;records.push(`${dir}/${file}\0${digest(content)}`);writes.push(writeFile(join(root,dir,file),content));}await Promise.all(writes);}
  const actualRecords=[];for(const record of records){const name=record.split('\0')[0];actualRecords.push(`${name}\0${digest(await readFile(join(root,name)))}`);}assert.deepStrictEqual(actualRecords,records,'Fixture content changed during creation');const fixture={directories:spec.dirs,files:records.length,manifestSha256:digest(actualRecords.join('\n')+'\n'),warmups:[],pairs:[]};result.fixtures[spec.name]=fixture;
  const invoke=async which=>{const start=performance.now();const paths=which==='baseline'?await baseline(root):await candidate(root,'',binary);const elapsedMs=performance.now()-start;if(paths===null)throw new Error('Native helper failed or returned invalid output; no fallback accepted');return {elapsedMs,paths};};
  for(let pair=0;pair<22;pair++){
   const order=pair%2===0?['baseline','candidate']:['candidate','baseline'],calls={};for(const which of order)calls[which]=await invoke(which);
   assert.deepStrictEqual(calls.candidate.paths,calls.baseline.paths,`${spec.name} pair ${pair+1} output differs`);
   const record={order,baselineMs:calls.baseline.elapsedMs,candidateMs:calls.candidate.elapsedMs,outputCount:calls.baseline.paths.length,outputSha256:digest(JSON.stringify(calls.baseline.paths))};
   (pair<2?fixture.warmups:fixture.pairs).push(record);
  }
  fixture.baseline=summary(fixture.pairs.map(p=>p.baselineMs));fixture.candidate=summary(fixture.pairs.map(p=>p.candidateMs));
 }
 const large=result.fixtures.large,small=result.fixtures.small;
 result.gate={largeMedianSpeedupPercent:100*(large.baseline.median-large.candidate.median)/large.baseline.median,smallMedianIncreaseMs:small.candidate.median-small.baseline.median,binaryBytes:result.binaryBytes};
 result.gate.largePass=result.gate.largeMedianSpeedupPercent>=25;result.gate.smallPass=result.gate.smallMedianIncreaseMs<=5;result.gate.binaryPass=result.gate.binaryBytes<=1024*1024;result.gate.pass=result.gate.largePass&&result.gate.smallPass&&result.gate.binaryPass;
 if(!result.gate.pass)process.exitCode=2;
}catch(error){result.errors.push(error.stack||String(error));process.exitCode=1;}finally{
 result.completedAt=new Date().toISOString();await outputFile.writeFile(JSON.stringify(result,null,2)+'\n');await outputFile.close();await rm(temp,{recursive:true,force:true});
}
