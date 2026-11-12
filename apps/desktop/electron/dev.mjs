import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../../../',import.meta.url));
// Bun builds the shell; Electron supplies the desktop and harness runtimes.
const built=spawn(process.execPath,['run','--cwd','apps/desktop','build'],{cwd:root,stdio:'inherit',windowsHide:true});
built.on('exit',code=>{
  if(code){process.exitCode=code;return;}
  const electron=resolve(root,'node_modules/electron/dist',process.platform==='win32'?'electron.exe':process.platform==='darwin'?'Electron.app/Contents/MacOS/Electron':'electron');
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(electron,[resolve(root,'apps/desktop')],{cwd:root,stdio:'inherit',windowsHide:true,env});
  child.on('exit',code=>{process.exitCode=code??1;});
});
