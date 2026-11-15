import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../../../',import.meta.url));
function failed(error){console.error(`Could not launch Suffice: ${error.message}`);process.exitCode=1;}
// Bun builds the shell; Electron supplies the desktop and harness runtimes.
const built=spawn(process.execPath,['run','--cwd','apps/desktop','build'],{cwd:root,stdio:'inherit',windowsHide:true});
built.on('error',failed);
built.on('exit',async code=>{
  if(code!==0){process.exitCode=code??1;return;}
  let electron=resolve(root,'node_modules/electron/dist',process.platform==='win32'?'electron.exe':process.platform==='darwin'?'Electron.app/Contents/MacOS/Electron':'electron');
  if(process.platform==='win32'){try{electron=await (await import('./dev-icon.mjs')).prepareWindowsDevExecutable(electron,resolve(root,'apps/desktop/assets/suffice-logo.ico'));}catch(error){failed(error);return;}}
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  console.log('Opening Suffice…');
  const child=spawn(electron,[resolve(root,'apps/desktop')],{cwd:root,stdio:'inherit',windowsHide:false,env});
  child.on('error',failed);
  child.on('exit',code=>{process.exitCode=code??1;});
});
