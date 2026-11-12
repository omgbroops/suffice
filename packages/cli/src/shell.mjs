import {existsSync} from 'node:fs';
import {win32} from 'node:path';

export function resolveWindowsBash(env=process.env,exists=existsSync){
 const drive=env.SystemDrive||'C:';
 const roots=[env.ProgramFiles,env.PROGRAMFILES,env['ProgramFiles(x86)'],`${drive}/Program Files`,`${drive}/Program Files (x86)`,env.LOCALAPPDATA&&win32.join(env.LOCALAPPDATA,'Programs')].filter(Boolean);
 const candidates=roots.map(root=>win32.join(root,'Git','bin','bash.exe'));
 for(const entry of (env.PATH||env.Path||'').split(';').filter(Boolean)){
  // Git installations also expose cmd/git.exe while omitting bash from PATH.
  if(/(?:^|[\\/])Git[\\/]cmd$/i.test(entry))candidates.push(win32.resolve(entry,'../bin/bash.exe'));
 }
 const found=candidates.find(exists);
 if(!found)throw new Error('Native Git Bash was not found. Install Git for Windows. Suffice will not fall back to the Windows WSL bash.exe launcher.');
 return found;
}
export function nativeShellPath(shellPath){return shellPath||(process.platform==='win32'?resolveWindowsBash():undefined);}
