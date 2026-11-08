import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {root} from '../src/runtime.mjs';

const directory=resolve(root,'reports/semantic-graph-v2'),manifest=JSON.parse(await readFile(resolve(directory,'manifest.json'),'utf8')),rows=[];
const parent=id=>id?.includes('/')?id.slice(0,id.lastIndexOf('/')):id;
for(const [i,item]of manifest.schedule.entries()){
  const id=`${String(i+1).padStart(3,'0')}-${item.task}-${item.arm}-r${item.repetition}`,path=resolve(directory,id);
  let result;try{result=JSON.parse(await readFile(resolve(path,'result.json'),'utf8'));}catch(e){if(e.code==='ENOENT')continue;throw e;}
  const messages=JSON.parse(await readFile(resolve(path,'transcript.json'),'utf8')),events=(await readFile(resolve(path,'events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
  const issued=new Map(),returned=new Map(),checks=[];
  messages.forEach((message,index)=>{
    if(message.role==='assistant')for(const part of message.content??[])if(part.type==='toolCall')issued.set(part.id,index);
    if(message.role==='toolResult')returned.set(message.toolCallId,{index,error:message.isError,text:(message.content??[]).filter(c=>c.type==='text').map(c=>c.text).join('\n')});
  });
  const outputs=new Map(events.filter(e=>e.type==='tool_result').map(e=>[e.callId,e]));
  const editEvents=events.map((event,index)=>({event,index})).filter(({event})=>event.type==='activated_edit');
  for(const {event:edit,index}of editEvents){
    const mutation=events.slice(index+1).find(e=>e.type==='tool_result'&&e.name===edit.tool&&e.args.path===edit.path),editAssistant=issued.get(parent(mutation?.callId));
    const delivered=(callId,needles=[])=>{const out=outputs.get(callId),response=returned.get(parent(callId));return !!out&&!!response&&!response.error&&response.index<editAssistant&&needles.every(s=>response.text.includes(s));};
    if(item.arm==='ast-assisted'&&edit.index===1){
      const evidence=edit.evidence?.ast,read=outputs.get(evidence?.callId),found=events.slice(0,index).some(e=>e.type==='tool_result'&&e.name==='symbols'&&e.data.matches?.some(n=>n.path===edit.path&&n.name===read?.data?.name));
      checks.push({edit:edit.index,path:edit.path,kind:'ast_initial',sourceRead:read?.data?.path===edit.path&&typeof read?.data?.text==='string',discovered:found,deliveredBeforeEditingModel:delivered(evidence?.callId,[edit.path,read?.data?.name??''])});
    }
    if(item.arm==='semantic-assisted'){
      const impact=edit.evidence?.semantic,inspection=impact?.inspection,a=outputs.get(impact?.callId),b=outputs.get(inspection?.callId),target=edit.evidence?.target;
      const discovery=events.slice(0,index).filter(e=>e.type==='tool_result'&&e.name==='semantic_symbols'&&e.data.revision===a?.data?.revision).reverse().find(e=>e.data.matches?.some(n=>target===edit.path?n.path===edit.path:n.id===target&&n.path===edit.path));
      const declaration=discovery?.data.matches.find(n=>n.id===target),span=edit.evidence?.span;
      const sameIdentity=!!a&&!!b&&a.args.symbol===target&&b.args.symbol===target&&a.data.symbol===target&&b.data.symbol===target;
      const epochRecord=events.slice(0,index).find(e=>e.type==='activation_evidence'&&e.callId===impact?.callId),inspectionEpoch=events.slice(0,index).find(e=>e.type==='activation_evidence'&&e.callId===inspection?.callId);
      checks.push({edit:edit.index,path:edit.path,kind:'semantic',sameIdentity,sameRevision:!!a&&!!b&&a.data.revision===b.data.revision&&a.data.revision===discovery?.data?.revision,
        sameEpoch:epochRecord?.epoch===edit.epoch&&inspectionEpoch?.epoch===edit.epoch,
        relevant:!!discovery&&(target===edit.path||edit.tool==='file_edit'&&declaration&&span.start>=declaration.start&&span.end<=declaration.start+declaration.length),
        dependenciesDeliveredBeforeEditingModel:delivered(inspection?.callId,[target??'']),impactDeliveredBeforeEditingModel:delivered(impact?.callId,[target??'','"affected"','"change"'])});
    }
  }
  const required=['ast-assisted','semantic-assisted'].includes(item.arm),expected=item.arm==='ast-assisted'?Math.min(editEvents.length,1):item.arm==='semantic-assisted'?editEvents.length:0;
  const pass=(!required||editEvents.length>0)&&checks.length===expected&&checks.every(c=>Object.entries(c).every(([key,value])=>['edit','path','kind'].includes(key)||value===true));
  rows.push({id,arm:item.arm,edits:editEvents.length,gateCompliant:result.activation.compliant,independentlyAudited:pass,checks});
}
const audit={executed:rows.length,requiredAttempts:rows.filter(r=>['ast-assisted','semantic-assisted'].includes(r.arm)).length,failed:rows.filter(r=>!r.independentlyAudited).map(r=>r.id),method:'Independent raw-result/transcript audit. Required evidence must be printed in a successful codemode response preceding the assistant generation that issued the edit. This is stronger than call ordering; it still cannot prove good reasoning.',rows};
await writeFile(resolve(directory,'activation-audit.json'),JSON.stringify(audit,null,2));console.log(JSON.stringify({executed:audit.executed,requiredAttempts:audit.requiredAttempts,failed:audit.failed}));if(audit.failed.length)process.exitCode=1;
