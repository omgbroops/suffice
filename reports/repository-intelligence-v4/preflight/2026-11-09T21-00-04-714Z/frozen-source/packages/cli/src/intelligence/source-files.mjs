import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {realpath} from 'node:fs/promises';
import {filesIn} from '../workspace.mjs';
const exec=promisify(execFile);
const extensions=['.js','.mjs','.cjs','.ts','.mts','.cts','.jsx','.tsx'];
export const isIntelligenceSource=path=>extensions.some(extension=>path.endsWith(extension));
export const isIntelligenceConfiguration=path=>['tsconfig.json','package.json'].includes(path.split('/').at(-1).toLowerCase());
const canonical=path=>process.platform==='win32'?path.replaceAll('\\','/').toLowerCase():path;

/** Keep the existing filesystem walk; Git only filters ignored, untracked files. */
export async function listIntelligenceSources(workspace){
  const files=(await filesIn(workspace)).filter(path=>isIntelligenceSource(path)||isIntelligenceConfiguration(path)),paths=files.filter(isIntelligenceSource),configurationPaths=files.filter(isIntelligenceConfiguration);
  const fallback=reason=>({paths,configurationPaths,selection:{method:'filesystem',reason,candidates:paths.length,ignored:0}});
  try{
    const gitArgs=['-C',workspace,'-c','core.fsmonitor=false'];
    const {stdout:root}=await exec('git',[...gitArgs,'rev-parse','--show-toplevel'],{windowsHide:true,timeout:3000});
    if(canonical(await realpath(root.trim()))!==canonical(await realpath(workspace)))return fallback('workspace-is-not-an-independent-git-root');
    if(!paths.length)return {paths,configurationPaths,selection:{method:'git-ignore',candidates:0,ignored:0}};
    let ignored=[];
    const request=exec('git',[...gitArgs,'check-ignore','--stdin','-z'],{windowsHide:true,timeout:3000,maxBuffer:4*1024**2});
    request.child.stdin.on('error',()=>{});
    request.child.stdin.end(paths.join('\0')+'\0');
    try{ignored=(await request).stdout.split('\0').filter(Boolean);}catch(e){if(e.code!==1)throw e;}
    const excluded=new Set(ignored),selected=paths.filter(path=>!excluded.has(path));
    return {paths:selected,configurationPaths,selection:{method:'git-ignore',candidates:paths.length,ignored:paths.length-selected.length}};
  }catch{return fallback('git-ignore-unavailable');}
}
