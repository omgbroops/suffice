import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,open,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const [baseArg,currentArg,outputArg]=process.argv.slice(2);
if(!baseArg||!currentArg||!outputArg)throw Error('Usage: node measure-desktop-pairs.mjs BASELINE CURRENT NEW_OUTPUT.json');
const roots={baseline:resolve(baseArg),current:resolve(currentArg)},output=resolve(outputArg),file=await open(output,'wx'),children=output+'.runs';await mkdir(children);
const run=promisify(execFile),harness=fileURLToPath(new URL('./measure-desktop.mjs',import.meta.url));
const result={schemaVersion:1,node:process.version,method:{pairs:5,order:'alternates baseline-first and current-first',profile:'every invocation uses independent fresh profile and identical generated sessions',osCache:'not flushed; OS-cold startup not established',scope:'same full packaged desktop workload as block comparison, repeated to investigate order/host drift; all runs and failures retained'},pairs:[],errors:[]};
try{
 for(let pair=0;pair<5;pair++){
  const row={iteration:pair+1,order:pair%2?['current','baseline']:['baseline','current']};
  for(const kind of row.order){const path=join(children,`${pair+1}-${kind}.json`);await run(process.execPath,[harness,roots[kind],path,join(roots[kind],'release/win-unpacked/Suffice.exe'),'--runs=1'],{timeout:90000,maxBuffer:1024*1024,windowsHide:true});const data=JSON.parse(await readFile(path,'utf8'));if(data.samples.length!==1||data.samples[0].errors.length)throw Error('Incomplete paired desktop run');row[kind]=data.samples[0];row[kind+'Trace']=path;}
  result.pairs.push(row);
 }
 const median=x=>x.sort((a,b)=>a-b)[2];
 result.summary={baselineReadyMs:median(result.pairs.map(p=>p.baseline.readyMs)),currentReadyMs:median(result.pairs.map(p=>p.current.readyMs)),baselineTerminalMs:median(result.pairs.map(p=>p.baseline.terminal.markerMs)),currentTerminalMs:median(result.pairs.map(p=>p.current.terminal.markerMs)),baselineTranscriptMs:median(result.pairs.map(p=>p.baseline.transcriptOpenMs)),currentTranscriptMs:median(result.pairs.map(p=>p.current.transcriptOpenMs))};
 result.summary.startupIncreasePercent=100*(result.summary.currentReadyMs/result.summary.baselineReadyMs-1);
}catch(error){result.errors.push(error.stack||String(error));process.exitCode=1;}finally{await file.writeFile(JSON.stringify(result,null,2)+'\n');await file.close();}
