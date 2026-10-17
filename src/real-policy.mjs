import { hash } from './workspace.mjs';

export const REAL_ARMS = Object.freeze([
  {id:'sol',model:'gpt-6.1-sol'},
  {id:'luna',model:'gpt-6-luna'},
  {id:'luna-review',model:'gpt-6-luna',review:true},
  {id:'luna-state',model:'gpt-6-luna',state:true},
  {id:'luna-prune',model:'gpt-6-luna',prune:true},
  {id:'luna-state-prune',model:'gpt-6-luna',state:true,prune:true},
  {id:'luna-repro',model:'gpt-6-luna',repro:true},
]);
export const API_METHODS = new Set(['valid','clean','inc','diff','major','minor','patch','prerelease','compare','compareBuild','rcompare','gt','gte','lt','lte','eq','neq','cmp','satisfies','validRange','subset','intersects','minVersion','maxSatisfying','minSatisfying','toComparators','outside','gtr','ltr','coerce','parse']);
export function validateCases(cases){
  if(!Array.isArray(cases)||cases.length<1||cases.length>24||JSON.stringify(cases).length>16000)throw new Error('Provide 1-24 bounded declarative cases.');
  for(const c of cases)if(!c||!API_METHODS.has(c.method)||!Array.isArray(c.args)||c.args.length>6||!Object.hasOwn(c,'expected')||Object.keys(c).some(k=>!['method','args','expected','field'].includes(k))||(c.field!==undefined&&!['version','raw','prerelease','build','major','minor','patch'].includes(c.field)))throw new Error('Each case needs a supported public method, args array, expected result, and optional supported object field.');
  return structuredClone(cases);
}
export function caseTestSource(cases){
  validateCases(cases);
  return `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport {createRequire} from 'node:module';\nimport {resolve} from 'node:path';\nconst require=createRequire(resolve(process.env.SUFFICE_WORKSPACE,'src/package.json'));\nconst api=require('./index.js');\nconst cases=${JSON.stringify(cases)};\ntest('generated reproduction',()=>{for(const c of cases){const value=api[c.method](...c.args);const actual=c.field?value?.[c.field]:value;assert.deepEqual(actual,c.expected,JSON.stringify(c));}});\n`;
}
export function compactReadOutputs(messages,{threshold=18000,keepRecent=2}={}){
  const input=JSON.stringify(messages).length;
  if(input<threshold)return {messages,removedCharacters:0,references:[]};
  const assistants=messages.map((m,i)=>m.role==='assistant'?i:-1).filter(i=>i>=0);
  const cutoff=assistants[Math.max(0,assistants.length-keepRecent)]??0;
  const references=[];
  const selected=messages.map((m,index)=>{
    if(index>=cutoff||m.role!=='toolResult'||!['file_read','search','files','codemode'].includes(m.toolName))return m;
    // Codemode can mix reads, edits and tests. Never guess its contents are expendable.
    if(m.toolName==='codemode')return m;
    const original=JSON.stringify(m.content);
    if(original.length<1200)return m;
    const ref=`message:${index}:${hash(original).slice(0,12)}`;references.push({ref,index,characters:original.length});
    return {...m,content:[{type:'text',text:`Older read output omitted; recover with evidence_read(index=${index}). Reference ${ref}. Current files remain readable. This is not a new task.`}]};
  });
  return {messages:selected,removedCharacters:input-JSON.stringify(selected).length,references};
}
export function parseReview(text,{patchReads=0}={}){
  let value;try{value=JSON.parse(text);}catch{return {valid:false,reason:'invalid_json'};}
  if(!value||!['approve','repair'].includes(value.verdict)||!Array.isArray(value.findings)||value.findings.some(f=>typeof f!=='string')||!patchReads)return {valid:false,reason:'invalid_review'};
  if(value.verdict==='repair'&&!value.findings.length)return {valid:false,reason:'missing_findings'};
  if(value.verdict==='approve'&&value.findings.length)return {valid:false,reason:'contradictory_review'};
  return {valid:true,verdict:value.verdict,findings:value.findings};
}
export function aggregatePhases(phases){
  const usage={input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,estimatedApiUsd:0};
  for(const phase of phases)for(const key of Object.keys(usage))usage[key]+=phase.usage?.[key]??0;
  const unknown=phases.some(p=>p.usageCostUnknown);
  return {usage,knownEstimatedUsd:usage.estimatedApiUsd,totalEstimatedUsd:unknown?null:usage.estimatedApiUsd,usageCostUnknown:unknown,latencyMs:phases.reduce((n,p)=>n+p.latencyMs,0),turns:phases.reduce((n,p)=>n+p.turns,0)};
}
export function reviewEligible(status){return ['completed','turn_limit','tool_limit','timeout'].includes(status);}
export function phaseCompletion(phases,arm,review){
  const worker=phases[0];
  if(!arm.review){
    if(worker.status!=='completed')return worker.status;
    if(arm.repro&&!(worker.reproduction?.before==='failed'&&worker.reproduction?.after==='passed'))return 'verification_failed';
    return 'completed';
  }
  if(!reviewEligible(worker.status))return worker.status;
  if(phases.length<2||!review?.valid)return 'invalid_review';
  const failed=phases.slice(1).find(p=>p.status!=='completed');if(failed)return failed.status;
  if(review.verdict==='repair'&&phases.length<3)return 'repair_missing';
  return 'completed';
}
