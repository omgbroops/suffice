import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {lstat,chmod} from 'node:fs/promises';
const require=createRequire(import.meta.url);
execFileSync(process.execPath,[require.resolve('electron/install.js')],{stdio:'inherit',windowsHide:true});
// node-pty 1.1.0 ships macOS spawn-helper without its execute bits (upstream #919).
// Repair only the installed host helper; never recurse through dependencies.
if(process.platform==='darwin'){
 const root=dirname(require.resolve('node-pty/package.json'));
 for(const relative of ['build/Release/spawn-helper',`prebuilds/darwin-${process.arch}/spawn-helper`]){
  const file=resolve(root,relative);let info;try{info=await lstat(file);}catch(error){if(error.code==='ENOENT')continue;throw error;}
  if(!info.isFile())throw new Error('Expected a regular node-pty helper: '+file);
  if((info.mode&0o111)!==0o111)await chmod(file,info.mode|0o111);
  console.log('node-pty helper executable:',relative);
 }
}
