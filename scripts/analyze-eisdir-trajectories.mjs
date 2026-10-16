import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve('../../suffice');
const audit=JSON.parse(await readFile(resolve(root,'reports/CONTEXT-WASTE-AUDIT.json'),'utf8'));
const cases=[];let sourceAttempts=0;const uniqueSubsequentCosts=new Map();
for(const row of audit.rows.filter(r=>['evidence-record','nemotron-retrieval'].includes(r.root))){
 sourceAttempts++;
 for(const file of row.sources.filter(p=>p.endsWith('transcript.json'))){
  const ms=JSON.parse(await readFile(resolve(root,file),'utf8'));
  for(let i=0;i<ms.length;i++){
   const m=ms[i];if(m.role!=='toolResult')continue;
   const calls=m.nestedCalls?.calls??[];
   for(const [ci,c] of calls.entries()){
    if(!/EISDIR/.test(c.error??''))continue;
    const nextAssistantIndex=ms.findIndex((x,j)=>j>i&&x.role==='assistant');
    const nextResultIndex=ms.findIndex((x,j)=>j>nextAssistantIndex&&x.role==='toolResult');
    const nextCalls=nextResultIndex>=0?(ms[nextResultIndex].nestedCalls?.calls??[]):[];
    const equivalents=[];
    for(let j=i+1;j<ms.length;j++)if(ms[j].role==='toolResult')for(const n of ms[j].nestedCalls?.calls??[])if(n.name===c.name)equivalents.push({message:j,path:n.arguments?.path??null,status:n.status,errorClass:/EISDIR/.test(n.error??'')?'EISDIR':n.error?'other':null});
    const first=equivalents[0]??null;
    const after=ms.slice(i+1).filter(x=>x.role==='assistant');
    const cost=after.reduce((s,x)=>s+(Number.isFinite(x.usage?.cost?.total)?x.usage.cost.total:0),0);
    for(let j=i+1;j<ms.length;j++)if(ms[j].role==='assistant'&&Number.isFinite(ms[j].usage?.cost?.total))uniqueSubsequentCosts.set(file+'#message='+j,ms[j].usage.cost.total);
    const output=(m.content??[]).filter(b=>b.type==='text').map(b=>b.text??'').join('\n');
    const outcome=!nextCalls.length?'no next nested calls':nextCalls.some(n=>n.name===c.name&&/EISDIR/.test(n.error??''))?'repeated EISDIR':nextCalls.some(n=>n.name===c.name&&['ok','completed'].includes(n.status))?'same tool succeeds': 'switch to other tools';
    cases.push({reference:file+'#message='+i+'&nested='+ci,attempt:row.root+'/'+row.campaign+'/'+row.run,failedTool:c.name,failedPath:c.arguments?.path??null,nextAssistantMessage:nextAssistantIndex,nextResultMessage:nextResultIndex,nextBehavior:outcome,nextCalls:nextCalls.map(n=>({name:n.name,path:n.arguments?.path??null,status:n.status,errorClass:/EISDIR/.test(n.error??'')?'EISDIR':n.error?'other':null})),nextEquivalent:first,laterEquivalentCount:equivalents.length,completedPriorCalls:calls.slice(0,ci).filter(n=>['ok','completed'].includes(n.status)).map(n=>n.name),recordedCallsAfterError:calls.slice(ci+1).map(n=>({name:n.name,status:n.status})),partialOutputCharacters:output.length,partialEmittedSectionCharacters:(output.split('Output:\n')[1]?.split('Script error:')[0]??'').trim().length,hasTextEmissionMarker:/==> text \d+\/\d+ <==/.test(output),nextAssistantRecordedCost:nextAssistantIndex<0?null:ms[nextAssistantIndex].usage?.cost?.total??null,subsequentKnownRecordedCost:cost,subsequentAssistantResponses:after.length,subsequentResponsesMissingCost:after.filter(x=>!Number.isFinite(x.usage?.cost?.total)).length});
   }
  }
 }
}
const counts=key=>Object.fromEntries([...new Set(cases.map(key))].map(k=>[k,cases.filter(c=>key(c)===k).length]));
const summary={sourceAttempts,errorCalls:cases.length,affectedAttempts:new Set(cases.map(c=>c.attempt)).size,failedTools:counts(c=>c.failedTool),nextBehavior:counts(c=>c.nextBehavior),nextEquivalent:counts(c=>!c.nextEquivalent?'no later same tool':c.nextEquivalent.errorClass==='EISDIR'?'EISDIR again':c.nextEquivalent.status==='ok'||c.nextEquivalent.status==='completed'?(c.nextEquivalent.path===null?'success omitted path':'success file path'):'other failure'),partialEmissions:cases.filter(c=>c.hasTextEmissionMarker).length,errorsWithCompletedPriorCalls:cases.filter(c=>c.completedPriorCalls.length).length,nextAssistantKnownCost:cases.reduce((s,c)=>s+(c.nextAssistantRecordedCost??0),0),subsequentCostAcrossErrorCases:cases.reduce((s,c)=>s+c.subsequentKnownRecordedCost,0)};
summary.errorsWithPreservedPartialOutput=cases.filter(c=>c.partialEmittedSectionCharacters>0).length;
summary.uniqueSubsequentKnownRecordedCost=[...uniqueSubsequentCosts.values()].reduce((a,b)=>a+b,0);
summary.subsequentResponsesMissingCost=cases.reduce((a,c)=>a+c.subsequentResponsesMissingCost,0);
if(sourceAttempts!==34||cases.length!==25||new Set(cases.map(c=>c.attempt)).size!==24)throw Error('Unexpected cohort coverage');
await writeFile('reports/EISDIR-TRAJECTORIES.json',JSON.stringify({mode:'offline static saved-transcript reconstruction',costCaveat:'Descriptive recorded cost, not avoidable cost. Subsequent costs overlap when an attempt has multiple errors; do not sum as unique spend.',summary,cases},null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
