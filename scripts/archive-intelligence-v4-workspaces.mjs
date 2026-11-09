// Move completed, already-published attempt state out of the Public sandbox
// namespace. This preserves every byte while bounding deny-list command length.
import {readFile,mkdir,rename,realpath,lstat,appendFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {publicWorkspaceRoot} from '../src/eval-v4/sandbox.mjs';
import {v4CellId} from '../src/eval-v4/design.mjs';
import {hash} from '../src/workspace.mjs';
const root=process.cwd(),out=resolve(root,'reports/repository-intelligence-v4'),load=async p=>JSON.parse(await readFile(p,'utf8'));
const protocol=await load(resolve(out,'protocol.json')),ledger=await load(resolve(out,'spending.json')),state=await load(resolve(out,'execution-status.json'));
const publicRoot=await realpath(publicWorkspaceRoot()),archiveRoot=resolve(root,'.suffice/intelligence-v4/archived-attempts');await mkdir(archiveRoot,{recursive:true});const actualArchive=await realpath(archiveRoot);
let moved=0;
for(const item of protocol.schedule.flat()){
  const cell=v4CellId(item),id=cell+'-a0';if(state.status==='running'&&state.cell===cell)continue;
  if(!ledger.entries.some(e=>e.runId==='repository-intelligence-v4/'+id&&e.state==='finished'))continue;
  let result;try{result=await load(resolve(out,'attempts',id+'.summary.json'));await lstat(resolve(out,'attempts',id+'.patch'));}catch(e){if(e.code==='ENOENT')continue;throw e;}
  if(result.status==='infrastructure_error')continue;
  for(const [name,label]of [[id,'actor'],['grade-'+id,'grader']]){
    const source=resolve(publicRoot,name),destination=resolve(actualArchive,id,label);let actual;try{actual=await realpath(source);}catch(e){if(e.code==='ENOENT')continue;throw e;}
    const inside=relative(publicRoot,actual),target=relative(actualArchive,destination);
    if(isAbsolute(inside)||inside.startsWith('..')||actual.toLowerCase()!==source.toLowerCase()||inside.includes('\\')||inside.includes('/')||isAbsolute(target)||target.startsWith('..'))throw new Error('Refusing move outside exact owned evaluation paths');
    try{await lstat(destination);throw new Error('Archive destination already exists');}catch(e){if(e.code!=='ENOENT')throw e;}
    await mkdir(resolve(actualArchive,id),{recursive:true});await rename(source,destination);
    await appendFile(resolve(out,'infrastructure/storage-relocations.jsonl'),JSON.stringify({at:new Date().toISOString(),id,label,source,destination,summarySha256:hash(await readFile(resolve(out,'attempts',id+'.summary.json'))),policy:'Same-volume move; completed state preserved, no recursive deletion'})+'\n');moved++;
  }
}
console.log(JSON.stringify({event:'v4_completed_storage_relocated',directories:moved}));
