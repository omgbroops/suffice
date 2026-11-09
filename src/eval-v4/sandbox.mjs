import {spawn} from 'node:child_process';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,realpath,copyFile,readdir} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname,relative,isAbsolute} from 'node:path';
import {homedir} from 'node:os';

export const sandboxExecutable=()=>process.env.SUFFICE_CODEX_SANDBOX_EXE??resolve(process.env.APPDATA,'npm/node_modules/@openai/codex/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe');
const normal=path=>path.replaceAll('\\','/');
export const publicWorkspaceRoot=()=>resolve(process.env.PUBLIC??'C:/Users/Public','SufficeV4');
export function sandboxArguments({workspace,readableRoots=[],deniedRoots=[],command,shellExecutable}){
  const entries={':root':'read',[normal(homedir())]:'deny',':workspace_roots':{'.':'write'}};
  for(const root of readableRoots)entries[normal(root)]='read';
  for(const root of deniedRoots)entries[normal(root)]='deny';
  const toml='{'+Object.entries(entries).map(([key,value])=>JSON.stringify(key)+'='+(typeof value==='string'?JSON.stringify(value):'{"."="write"}')).join(',')+'}';
  const quote=value=>"'"+value.replaceAll("'","''")+"'",scratch=quote(resolve(workspace,'.v4-tmp'));
  const invocation="$ErrorActionPreference='Stop'; Set-Location -LiteralPath "+quote(workspace)+"; "+['TEMP','TMP','HOME','USERPROFILE','APPDATA','LOCALAPPDATA'].map(name=>'$env:'+name+'='+scratch+'; ').join('')+"$env:NODE_OPTIONS='--max-old-space-size=384'; "+command+"\nif ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }";
  return ['-c','windows.sandbox="mxc"','-c','permissions.suffice-v4.filesystem='+toml,'-c','permissions.suffice-v4.network.enabled=false','sandbox','-P','suffice-v4','-C',workspace,'--',shellExecutable,'-NoLogo','-NoProfile','-NonInteractive','-Command',invocation];
}
export async function sandboxOperations({workspace,readableRoots=[],toolchain}){
  if(process.platform!=='win32')throw new Error('This evaluation boundary requires preflighted Windows MXC');
  workspace=await realpath(workspace);readableRoots=await Promise.all(readableRoots.map(root=>realpath(root)));
  const publicRoot=publicWorkspaceRoot(),within=relative(publicRoot,workspace);
  if(isAbsolute(within)||within.startsWith('..')||!within)throw new Error('Agent workspace must be inside the owned Public/SufficeV4 directory');
  const attempt=within.split(/[\\/]/)[0],allowed=new Set([attempt]);
  for(const root of readableRoots){const inside=relative(publicRoot,root);if(inside&&!inside.startsWith('..')&&!isAbsolute(inside))allowed.add(inside.split(/[\\/]/)[0]);}
  const deniedRoots=(await readdir(publicRoot,{withFileTypes:true})).filter(entry=>entry.isDirectory()&&!allowed.has(entry.name)).map(entry=>resolve(publicRoot,entry.name));
  const shellExecutable=process.env.SUFFICE_EVAL_SHELL??(await promisify(execFile)('where.exe',['pwsh'],{windowsHide:true})).stdout.trim().split(/\r?\n/)[0];
  readableRoots.push(await realpath(dirname(shellExecutable)));
  const scratch=resolve(workspace,'.v4-tmp');await mkdir(scratch,{recursive:true});
  const executable=sandboxExecutable();
  const env={SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,COMSPEC:'C:/Windows/System32/cmd.exe',USERPROFILE:homedir(),APPDATA:process.env.APPDATA,LOCALAPPDATA:process.env.LOCALAPPDATA,
    PATH:[toolchain,'C:/Program Files/nodejs','C:/Program Files/Git/cmd','C:/Program Files/Git/usr/bin','C:/Windows/System32'].filter(Boolean).join(';'),
    HOME:scratch,TEMP:scratch,TMP:scratch,LANG:'en_US.UTF-8',CI:'true',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'NUL',GIT_TERMINAL_PROMPT:'0'};
  return {executable,shellExecutable,async exec(command,cwd,{onData,signal,timeout=180}={}){
    if((await realpath(cwd)).toLowerCase()!==workspace.toLowerCase())throw new Error('Sandbox cwd changed');
    return new Promise((done,reject)=>{
      const child=spawn(executable,sandboxArguments({workspace,readableRoots,deniedRoots,command,shellExecutable}),{cwd:workspace,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
      const timer=setTimeout(()=>child.kill(),timeout*1000),abort=()=>child.kill();signal?.addEventListener('abort',abort,{once:true});
      child.stdout.on('data',data=>onData?.(data));child.stderr.on('data',data=>onData?.(data));
      child.on('error',error=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(error);});
      child.on('close',(code,termination)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);done({exitCode:code??(termination?137:1)});});
    });
  }};
}
export async function stageToolchain(root){
  const path=resolve(publicWorkspaceRoot(),'toolchain');await mkdir(path,{recursive:true});
  // Use the already installed ripgrep; no package installation or network lookup.
  const rg=process.env.SUFFICE_RG_EXE??(await promisify(execFile)('where.exe',['rg'],{windowsHide:true})).stdout.trim().split(/\r?\n/)[0];
  await copyFile(rg,resolve(path,'rg.exe'));
  return path;
}
export async function binaryHash(path){const digest=createHash('sha256');for await(const chunk of createReadStream(path))digest.update(chunk);return digest.digest('hex');}
export function lazySandboxOperations(settings){let pending;return {async exec(command,cwd,options){pending??=sandboxOperations({...settings,workspace:cwd});return (await pending).exec(command,cwd,options);}};}
