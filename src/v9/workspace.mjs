import {lstat,readFile,writeFile,mkdir,rm,readdir,realpath,chmod} from 'node:fs/promises';
import {resolve,relative,isAbsolute,dirname,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const inside=(root,path)=>{const r=relative(root,path);return r===''||(!isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+sep));};
export async function safePath(root,name) {
  if(typeof name!=='string'||!name||isAbsolute(name)||/^[A-Za-z]:/.test(name)||name.includes('\\')||name.split('/').some(x=>['..','.git','.codex'].includes(x)))throw Error('Unsafe workspace path');
  const path=resolve(root,name);
  if(!inside(root,path)||path===root)throw Error('Path escapes workspace');
  let parent=path;
  for(;;){try{if(!inside(root,await realpath(parent)))throw Error('Symlink escapes workspace');break;}catch(e){if(e.code!=='ENOENT')throw e;parent=dirname(parent);}}
  return path;
}
export async function gitRoot(workspace) {
  const root=await realpath(workspace);
  const top=await realpath((await exec('git',['rev-parse','--show-toplevel'],{cwd:root})).stdout.trim());
  if(top!==root)throw Error('v9 requires the task Git repository root');
  return root;
}
export async function captureTree(root,{includeIgnored=false}={}) {
  const inventories=await Promise.all([exec('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,maxBuffer:8_000_000}),
    ...(includeIgnored?[exec('git',['ls-files','--others','--ignored','--exclude-standard','-z'],{cwd:root,maxBuffer:8_000_000})]:[])]);
  const stdout=inventories.map(v=>v.stdout).join('\0');
  const files=new Map();let total=0;
  for(const name of [...new Set(stdout.split('\0').filter(Boolean))].sort()) {
    if(name.startsWith('.suffice-v9-checks/'))continue;
    const path=await safePath(root,name);let stat;
    try{stat=await lstat(path);}catch(e){if(e.code==='ENOENT')continue;throw e;}
    if(stat.isSymbolicLink()||!stat.isFile())throw Error('Task snapshots require regular files, without submodules or symlinks');
    total+=stat.size;if(total>64_000_000||files.size>=5000)throw Error('Source snapshot exceeds v9 allowance');
    files.set(name,{bytes:await readFile(path),mode:stat.mode&0o777});
  }
  return files;
}
export function treeHash(tree) {return hash([...tree].map(([name,v])=>`${name}\0${v.mode}\0${hash(v.bytes)}`).join('\n'));}
export async function restoreTree(root,tree) {
  const current=await captureTree(root,{includeIgnored:true});
  for(const name of current.keys())if(!tree.has(name))await rm(await safePath(root,name));
  for(const [name,{bytes,mode}] of tree){const path=await safePath(root,name);await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes);await chmod(path,mode);}
}
export async function writeTree(directory,tree) {
  await mkdir(directory,{recursive:true});
  if((await readdir(directory)).length)throw Error('Snapshot directory must be empty');
  for(const [name,{bytes,mode}]of tree){const path=await safePath(await realpath(directory),name);await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes);await chmod(path,mode);}
}
const checkConfig=name=>/(^|\/)(jest\.config\.[^/]+|vitest\.config\.[^/]+|ava\.config\.[^/]+|pytest\.ini|tox\.ini|\.mocharc[^/]*|\.nycrc[^/]*|\.taprc|\.npmrc|\.gitignore|\.gitmodules)$/.test(name);
export function protectedFiles(tree,explicit=[]) {
  const names=new Set(explicit);
  for(const name of tree.keys())if(/(^|\/)(tests?|__tests__|specs?)(\/|\.)|\.(test|spec)\.[^/]+$/.test(name)||checkConfig(name))names.add(name);
  for(const name of names)if(!tree.has(name))throw Error(`Protected source is missing: ${name}`);
  return new Map([...names].map(name=>[name,tree.get(name)]));
}
export async function enforceChecks(root,original,protectedTree) {
  const violations=[];
  for(const name of (await captureTree(root,{includeIgnored:true})).keys())if(!original.has(name)&&checkConfig(name)){violations.push(name);await rm(await safePath(root,name));}
  for(const [name,value]of protectedTree){let now;try{now=await readFile(await safePath(root,name));}catch{}
    if(!now?.equals(value.bytes)){violations.push(name);const path=await safePath(root,name);await mkdir(dirname(path),{recursive:true});await writeFile(path,value.bytes);}}
  // Preserve scripts and embedded runner settings (e.g. package.json's `jest`).
  // Application/packaging fields remain editable; project-specific settings need explicit protection.
  for(const [name,value]of original)if(/(^|\/)package\.json$/.test(name)){
    const before=JSON.parse(value.bytes.toString('utf8'));const path=await safePath(root,name);
    let after;try{after=JSON.parse(await readFile(path,'utf8'));}catch{violations.push(name);await mkdir(dirname(path),{recursive:true});await writeFile(path,value.bytes);continue;}
    const fixed={...after};for(const key of ['scripts','jest','vitest','ava','mocha','nyc','c8','tap']){if(Object.hasOwn(before,key))fixed[key]=before[key];else delete fixed[key];}
    if(JSON.stringify(after)!==JSON.stringify(fixed)){violations.push(`${name}:check-configuration`);await writeFile(path,JSON.stringify(fixed,null,2)+'\n');}
  }
  return violations;
}
