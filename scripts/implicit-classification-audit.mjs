import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {classifyChange as current} from '../packages/cli/src/implicit/change.mjs';
const root=resolve(import.meta.dirname,'..'),dir=resolve(root,'reports/implicit-semantic-v1'),manifest=JSON.parse(await readFile(resolve(dir,'manifest.json'),'utf8')),archive=JSON.parse(gunzipSync(await readFile(resolve(dir,'inputs.json.gz'))));
const oldPath=resolve(root,'.suffice/implicit-frozen-classifier.mjs');await writeFile(oldPath,execFileSync('git',['show',`${manifest.sourceCommit}:packages/cli/src/implicit/change.mjs`],{cwd:root,windowsHide:true}));const {classifyChange:frozen}=await import(pathToFileURL(oldPath).href);
const records=[];
for(const [index,item]of manifest.schedule.entries()){
 const id=`${String(index+1).padStart(3,'0')}-${item.task}-${item.arm}-r${item.repetition}`,events=(await readFile(resolve(dir,id,'events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse),task=manifest.tasks.find(t=>t.id===item.task),state=new Map(),pending=new Map();
 for(const p of Object.keys(task.hashes))state.set(p,Buffer.from(archive.files[`tasks/${task.id}/workspace/${p}`].base64,'base64').toString('utf8'));
 for(const e of events){if(e.type==='tool_result'&&['file_edit','file_write'].includes(e.name)){const p=e.args.path,before=state.get(p);if(!pending.has(p))pending.set(p,before);state.set(p,e.name==='file_edit'?before.replace(e.args.oldText,e.args.newText):e.args.content);}
  if(e.type==='implicit_context'&&e.event==='edit'&&pending.has(e.path)){const before=pending.get(e.path),after=state.get(e.path);pending.delete(e.path);const a=frozen(before,after,e.path),b=current(before,after,e.path),pick=c=>({kind:c.kind,external:c.external,typecheck:c.typecheck});records.push({id,path:e.path,frozen:pick(a),current:pick(b),changed:JSON.stringify(pick(a))!==JSON.stringify(pick(b))});}
 }
}
const output={sourceCommit:manifest.sourceCommit,comparedEditBatches:records.length,changedClassifications:records.filter(r=>r.changed).length,records,note:'Post-study hardening is tested deterministically and compared offline against every recorded implicit edit batch. No model attempts were rerun; original results remain frozen.'};await writeFile(resolve(dir,'post-study-classification-audit.json'),JSON.stringify(output,null,2));console.log(JSON.stringify({compared:records.length,changed:output.changedClassifications}));
