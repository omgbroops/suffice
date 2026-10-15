import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {ROOT,LINUX_RUNTIME} from './general-execution.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const file=resolve(ROOT,'reports/general-v1/frozen-configuration.json');
const paths=['package.json','package-lock.json','configs/general-v1.json','src/runtime.mjs','src/workspace.mjs','src/symbol-navigation.mjs','src/external-pi-observer.mjs','src/general/tools.mjs','src/general/agent.mjs','src/general/entry.mjs','scripts/general-execution.mjs','scripts/general-boundary.sh','scripts/general-run.mjs','scripts/setup-general-runtime.sh'];
const fingerprints=async()=>{const inputs={};for(const p of paths)inputs[p]=hash(await readFile(resolve(ROOT,p)));return inputs;};
export async function verifyGeneral(){const m=JSON.parse(await readFile(file));const current=await fingerprints();if(JSON.stringify(m.inputs)!==JSON.stringify(current))throw new Error('Frozen general-v1 source drift');return m;}
const isMain=process.argv[1]&&resolve(process.argv[1])===resolve(import.meta.filename);
if(isMain&&process.argv[2]==='verify')console.log(JSON.stringify({passed:!!await verifyGeneral()}));
else if(isMain&&process.argv[2]==='freeze'){
 const preflight=JSON.parse(await readFile(resolve(ROOT,'reports/general-v1/preflight.json'))),compat=JSON.parse(await readFile(resolve(ROOT,'.suffice/compat/latest.json'))),boundary=JSON.parse(await readFile(resolve(ROOT,'reports/general-v1/boundary-validation.json')));
 if(!preflight.passed||!compat.result.passed||!boundary.passed)throw new Error('Compatibility gates required');
 const r=spawnSync('wsl.exe',['-d','Ubuntu','--','sha256sum',LINUX_RUNTIME+'/bin/node',LINUX_RUNTIME+'/app/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js',LINUX_RUNTIME+'/app/package-lock.json'],{encoding:'utf8',windowsHide:true});if(r.status!==0)throw new Error(r.stderr);
 const revision=spawnSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).stdout.trim();
 const manifest={at:new Date().toISOString(),version:'suffice-general-v1',revision,inputs:await fingerprints(),runtimeFiles:r.stdout.trim().split('\n'),profile:JSON.parse(await readFile(resolve(ROOT,'configs/general-v1.json'))),compatibility:compat,preflightPassed:true,boundaryValidation:boundary,oldBaselinePreserved:preflight.baselinePreserved,claim:'Tool compatibility only; no inference efficiency or capability advantage established by validation.'};
 await writeFile(file,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
 for(const p of paths){const dest=resolve(ROOT,'.suffice/general-v1-frozen/source',p);await mkdir(dirname(dest),{recursive:true});await copyFile(resolve(ROOT,p),dest);}
 console.log(JSON.stringify({frozen:true,revision,files:paths.length,version:manifest.version}));
}
