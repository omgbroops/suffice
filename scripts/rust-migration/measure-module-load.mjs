import {spawnSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
const args=process.argv.slice(2);
if(args[0]==='--child'){
 const root=resolve(args[1]),start=performance.now();
 await import(pathToFileURL(join(root,'apps/desktop/electron/provider-settings.mjs')).href);
 await import(pathToFileURL(join(root,'apps/desktop/electron/resources.mjs')).href);
 console.log(JSON.stringify({loadMs:performance.now()-start,memory:process.memoryUsage(),resource:process.resourceUsage(),node:process.version}));
}else{
 if(args.length!==3)throw Error('Usage: node measure-module-load.mjs BASELINE CURRENT NEW_OUTPUT.json');
 const [baseline,current,output]=args.map(x=>resolve(x)),result={schemaVersion:1,node:process.version,method:'Five alternating fresh Node process pairs importing real provider/settings and resource modules without invoking providers; process RSS and module load latency only, not whole-app evidence.',pairs:[]};
 for(let i=0;i<5;i++){const pair={iteration:i+1,order:i%2?['current','baseline']:['baseline','current']};for(const kind of pair.order){const run=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--child',kind==='current'?current:baseline],{encoding:'utf8',windowsHide:true,env:{...process.env,PI_OFFLINE:'1'},timeout:30000});if(run.status!==0)throw Error(run.stderr);pair[kind]=JSON.parse(run.stdout);}result.pairs.push(pair);}
 await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result.pairs.map(p=>({baselineMs:p.baseline.loadMs,currentMs:p.current.loadMs,baselineRSS:p.baseline.memory.rss,currentRSS:p.current.memory.rss}))));
}
