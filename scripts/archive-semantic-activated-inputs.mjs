import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute,sep} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

// Preserve exact working-tree bytes, including the original mixed Windows/LF
// line endings. Prefer intact frozen bytes; fall back to the immutable Git blob.
const root=resolve(import.meta.dirname,'..'),report=resolve(root,'reports/semantic-graph-v2'),manifest=JSON.parse(await readFile(resolve(report,'manifest.json'),'utf8'));
const stage=resolve(root,'.suffice/semantic-frozen-inputs-v2'),files=new Map(),hash=b=>createHash('sha256').update(b).digest('hex');
const inside=(base,path)=>{const r=relative(base,path);return r!==''&&!isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+sep);};
const put=async(path,bytes,expected)=>{
  const target=resolve(stage,path);if(!inside(stage,target)||path.includes('\n'))throw new Error('Invalid archive path');
  if(expected&&hash(bytes)!==expected)throw new Error(`Frozen input differs: ${path}`);
  if(files.has(path))return;await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes);files.set(path,hash(bytes));
};
for(const [path,expected]of Object.entries(manifest.inputs)){
  const blob=execFileSync('git',['show',`${manifest.sourceCommit}:${path}`],{cwd:root,maxBuffer:4*1024**2});
  const normalized=blob.toString('utf8').replaceAll('\r\n','\n'),variants=[blob,Buffer.from(normalized),Buffer.from(normalized.replaceAll('\n','\r\n'))];
  let current;try{current=await readFile(resolve(root,path));}catch{}
  const bytes=[current,...variants].filter(Boolean).find(b=>hash(b)===expected);if(!bytes)throw new Error(`No exact frozen newline variant: ${path}`);await put(path,bytes,expected);
}
for(const task of manifest.tasks){
  const prefix=`.suffice/semantic-tasks-v1/${task.id}`;
  for(const [path,expected]of Object.entries(task.hashes))await put(`${prefix}/workspace/${path}`,await readFile(resolve(root,prefix,'workspace',path)),expected);
  const grader=task.id==='prerelease-diff'?`benchmarks/efficiency/${task.id}.test.mjs`:`benchmarks/tasks/${task.id}/acceptance.test.mjs`;
  await put(grader,await readFile(resolve(root,grader)),task.acceptanceHash);
  await put(`${prefix}/validation.json`,await readFile(resolve(report,`validation-${task.id}.json`)));
}
for(const path of ['reports/semantic-graph-v2/manifest.json',...manifest.tasks.map(t=>`reports/semantic-graph-v2/validation-${t.id}.json`)])await put(path,await readFile(resolve(root,path)));
const inventory={sourceCommit:manifest.sourceCommit,executionCommit:JSON.parse(await readFile(resolve(report,'completion.json'),'utf8')).executionCommit,files:Object.fromEntries(files),note:'Extract only into a fresh checkout of the frozen execution commit. Hidden grader/reference metadata stays outside all worker workspace directories.'};
await put('reports/semantic-graph-v2/frozen-input-inventory.json',Buffer.from(JSON.stringify(inventory,null,2)));
const list=resolve(root,'.suffice/semantic-frozen-files-v2.txt');await writeFile(list,[...files.keys()].join('\n')+'\n');
const archive=resolve(report,'frozen-inputs.tar.gz');execFileSync('tar',['-czf',archive,'-C',stage,'-T',list],{windowsHide:true});
const bytes=await readFile(archive);await writeFile(resolve(report,'frozen-input-archive.json'),JSON.stringify({archive:'frozen-inputs.tar.gz',sha256:hash(bytes),bytes:bytes.length,files:files.size,sourceCommit:manifest.sourceCommit},null,2));
console.log(JSON.stringify({files:files.size,bytes:bytes.length,sha256:hash(bytes)}));
