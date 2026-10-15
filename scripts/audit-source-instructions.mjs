// Explain the strict prompt-parity failure without changing the frozen checks.
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {getSystemMessageText} from '@earendil-works/pi-ai';
import {hash} from '../src/workspace.mjs';
import {createRuntime} from '../src/runtime.mjs';
const {convertResponsesMessages}=await import(new URL('./api/openai-responses-shared.js',import.meta.resolve('@earendil-works/pi-ai')));
const runtime=await createRuntime(),model=runtime.getModel('openai','gpt-6.1-sol');
const dir=resolve('.suffice/source-presentation-v2'),rows=[],failures=[],variants=new Set();
const visibleToolCharacters={A:0,B:0};
for(const id of (await readdir(dir)).filter(n=>/^\d{3}-/.test(n)).sort()){
 const base=resolve(dir,id),r=JSON.parse(await readFile(resolve(base,'result.json'),'utf8'));
 const tr=JSON.parse(await readFile(resolve(base,'worker/transcript.json'),'utf8'));
 const systems=tr.filter(m=>m.role==='system'),es=(await readFile(resolve(base,'worker/events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
 const rendered=getSystemMessageText(systems[0]);
 const cwdBlock=`<cwd>\n${resolve(base,'workspace').replace(/\\/g,'/')}\n</cwd>`;
 const hasExactCwd=systems.length===1&&systems[0].sections?.cwd===cwdBlock&&rendered.split(cwdBlock).length===2;
 const converted=convertResponsesMessages(model,{messages:systems},new Set(['openai']));
 const loggedShape=model.api==='openai-codex-responses'?{instructions:rendered,system:[]}:{system:converted.filter(m=>['system','developer'].includes(m.role))};
 const loggedHash=hash(JSON.stringify(loggedShape));
 const matchesActualWire=es.filter(e=>e.type==='provider_request').every(e=>e.instructionsHash===loggedHash);
 const normalized=JSON.stringify(loggedShape).replace(JSON.stringify(cwdBlock).slice(1,-1),JSON.stringify('<cwd>\n[attempt workspace]\n</cwd>').slice(1,-1));
 const normalizedHash=hash(normalized);variants.add(normalizedHash);
 const toolCharacters=tr.filter(m=>m.role==='toolResult').reduce((n,m)=>n+m.content.filter(c=>c.type==='text').map(c=>c.text).join('\n').length,0);
 visibleToolCharacters[r.arm]+=toolCharacters;
 if(!hasExactCwd||!matchesActualWire)failures.push(id);
 rows.push({id,hasExactCwd,matchesActualWire,loggedHash,normalizedHash,visibleToolCharacters:toolCharacters});
}
if(variants.size!==1)failures.push('instruction differences beyond the exact workspace field');
const out={at:new Date().toISOString(),postHoc:true,providerApi:model.api,passed:failures.length===0,failures,normalization:'Replace only the exact SDK-generated <cwd> section with a constant label. Reconstruct the complete actual instructions hash using the installed provider serializer and saved system message; match every logged provider request first.',rawByteParityPassed:false,normalizedVariants:variants.size,interpretation:'All instruction differences explained by the per-attempt working directory if passed. This is a post-hoc explanation, not a replacement for the failed frozen byte-parity gate. Workspace paths expose run IDs and arm labels; cache and trajectory effects are not isolated.',visibleToolCharacters,rows};
await writeFile('reports/source-presentation-v2/instruction-parity.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out));if(!out.passed)process.exitCode=1;
