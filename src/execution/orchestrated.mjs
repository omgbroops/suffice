import {mkdir,writeFile,realpath,readdir,open} from 'node:fs/promises';
import {resolve,relative,isAbsolute,sep} from 'node:path';
import {Type} from 'typebox';
import {normalizeRequest,PIPELINE_POLICY,THIN_PROMPT} from '../pipeline/policy.mjs';
import {createPipelineSession} from '../pipeline/session.mjs';
import {repositoryTools} from '../../packages/cli/src/tools.mjs';
import {createObservationController} from '../pipeline/observations.mjs';
import {withExecutionOutput} from './core.mjs';
import {executionSystemPrompt} from './scope.mjs';
import {runPublicCheck} from '../pipeline/executor.mjs';

export const COORDINATOR_PROMPT='You coordinate an implementation in the authorized environment. Do not write source code or perform edits yourself. Delegate implementation to Luna with a focused outcome and the task constraints. Use investigate delegation only when a bounded source investigation is needed; cheap reads and AST navigation are available directly. After delegation, inspect the relevant evidence and use verify to check the actual implementation. A worker summary is a claim, not proof. Preserve exact paths and diagnostics, retrieve retained output when needed, and repair observed public failures through delegation. Never claim that partial public checks establish full correctness. Keep delegation briefs and final reports concise.';
const save=async(path,value)=>{await mkdir(resolve(path,'..'),{recursive:true});await writeFile(path,JSON.stringify(value,null,2)+'\n',{mode:0o600});};

// Experimental coordinator. All editing and shell execution belongs to Luna;
// Sol has only source inspection, delegation, retained-output retrieval and the
// fixed caller-provided verification commands. One worker at a time avoids edits
// racing in the shared workspace. Every response uses the same global allowance.
export async function executeOrchestrated(request,deps={}) {
  const r=normalizeRequest({...request,profile:'baseline',features:{outputControl:true}});
  const workspace=await realpath(r.workspace),runDir=resolve(r.runDir);
  await mkdir(runDir,{recursive:true});
  const rel=relative(workspace,await realpath(runDir));
  if(rel===''||(!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+sep)))throw Error('runDir must be outside the working repository');
  await save(resolve(runDir,'request.json'),{strategy:'orchestrated',model:r.model,effort:r.effort,workerModel:PIPELINE_POLICY.worker,
    workerEffort:PIPELINE_POLICY.workerEffort,executionScope:r.executionScope,checks:r.checks,maxTurns:r.maxTurns,maxCalls:r.maxCalls,maxCostUsd:r.maxCostUsd});
  const now=deps.now??Date.now,start=now(),deadline=start+r.timeoutMs;
  const usage={input:0,cacheRead:0,cacheWrite:0,output:0,estimatedApiUsd:0,modelCalls:0,toolCalls:0,costUnknown:false};
  const stages=[],verification=[],notes=[];let busy=false,delegations=0,implementations=0,status='completed',final='';
  const allowance=(paid=false)=>{
    if(usage.costUnknown)throw Error('Unknown inference cost; stopped');
    if(now()>=deadline||usage.estimatedApiUsd>r.maxCostUsd||usage.modelCalls>r.maxTurns||usage.toolCalls>r.maxCalls||
      (paid&&(usage.estimatedApiUsd>=r.maxCostUsd||usage.modelCalls>=r.maxTurns)))throw Error('Shared task allowance exhausted');
  };
  const observation=createObservationController({workspace,artifactDir:resolve(runDir,'coordinator-output'),maxChars:4000});
  async function stage(label,model,effort,prompt,tools,systemPrompt,{outputControl=false}={}) {
    allowance(true);const begin=now(),ownUsage={input:0,cacheRead:0,cacheWrite:0,output:0,estimatedApiUsd:0,modelCalls:0,toolCalls:0};let control,error=null,text='',requests=0,replies=0;
    const gate=pi=>{
      pi.on('before_provider_request',()=>{allowance(true);requests++;});
      pi.on('tool_call',()=>{usage.toolCalls++;ownUsage.toolCalls++;try{allowance();}catch(e){control?.abort();return {block:true,reason:e.message};}});
    };
    let options={cwd:workspace,home:resolve(runDir,label,'state'),model,effort,provider:'openai',profile:label,
      timeout:Math.max(.01,(deadline-now())/1000),maxCost:r.maxCostUsd-usage.estimatedApiUsd,
      maxTurns:r.maxTurns-usage.modelCalls,maxCalls:r.maxCalls-usage.toolCalls,tools,systemPrompt,extensions:[gate]};
    options=await withExecutionOutput(options,{workspace,artifactDir:resolve(runDir,label,'output'),enabled:outputControl,record:n=>notes.push(n)});
    try {
      control=await (deps.createSession??createPipelineSession)(options,r.runtime,{onAssistant:m=>{
        replies++;usage.modelCalls++;ownUsage.modelCalls++;
        for(const key of ['input','cacheRead','cacheWrite','output']){usage[key]+=m.usage?.[key]??0;ownUsage[key]+=m.usage?.[key]??0;}
        if(Number.isFinite(m.usage?.cost?.total)&&m.usage.cost.total>=0){usage.estimatedApiUsd+=m.usage.cost.total;ownUsage.estimatedApiUsd+=m.usage.cost.total;}else usage.costUnknown=true;
        if(['error','aborted'].includes(m.stopReason))usage.costUnknown=true;
        if(m.content?.some(c=>c.type==='toolCall'))try{allowance(true);}catch{control?.abort();}
      }});
      text=await control.run(prompt);
    }catch(e){error=e.message;}
    finally {
      if(control)try{await control.dispose();}catch(e){error??=e.message;}
      if(requests>replies)usage.costUnknown=true;
      const entry={label,model,effort,replyCount:replies,providerRequests:requests,final:text,error,eventPath:control?.eventPath??null,
        latencyMs:now()-begin,usage:ownUsage,includesNestedLatency:label==='coordinate'};
      stages.push(entry);await save(resolve(runDir,label,'stage.json'),entry);
    }
    if(error)throw Error(`${label}: ${error}`);
    allowance();return text;
  }
  const native=repositoryTools({workspace,shellPath:r.shellPath});
  const readOnly=native.filter(t=>!['write','edit','bash'].includes(t.name));
  async function verify() {
    if(busy)throw Error('Wait for the active worker before verification');
    const outcomes=[];
    for(const check of r.checks) {
      allowance();
      outcomes.push(await (deps.runCheck??runPublicCheck)({workspace,check,timeoutMs:Math.min(check.timeoutMs??60000,deadline-now())}));
    }
    const record={outcomes,passed:outcomes.length>0&&outcomes.every(x=>x.passed&&x.exitCode===0&&!x.error)};
    verification.push(record);await save(resolve(runDir,`checks-${verification.length}.json`),record);
    return record;
  }
  const delegate={name:'delegate',label:'Delegate to Luna',description:'Give a focused investigation or implementation to Luna. At most four sequential delegations. Luna sees the original task plus your brief, not your whole transcript. Full worker receipts are retained; summaries are not proof.',
    parameters:Type.Object({kind:Type.Union([Type.Literal('investigate'),Type.Literal('implement')]),brief:Type.String({minLength:1,maxLength:5000})}),
    async execute(_id,{kind,brief}) {
      allowance(true);
      if(busy)throw Error('A worker is active; await it before delegating again');
      if(delegations>=4)throw Error('Four-delegation allowance exhausted');
      busy=true;const label=`delegate-${++delegations}-${kind}`;
      if(kind==='implement')implementations++;
      try {
        const prompt=`Original public task:\n${r.prompt}\n\nCoordinator brief (within the original task):\n${brief}\n\n${kind==='investigate'?'Inspect only; do not edit.':'Implement and verify in the existing workspace.'} Return a concise handoff with exact paths, commands and exit codes actually observed, remaining failures, and uncertainties. Do not claim unrun checks.`;
        const summary=await stage(label,PIPELINE_POLICY.worker,PIPELINE_POLICY.workerEffort,prompt,
          kind==='investigate'?readOnly:undefined,
          kind==='investigate'?'Investigate the supplied task using read-only source tools. Return evidence and uncertainties; do not write code.':executionSystemPrompt(r.executionScope,THIN_PROMPT),
          {outputControl:kind==='implement'});
        const ids=(await readdir(resolve(runDir,label,'output')).catch(()=>[])).filter(p=>p.endsWith('.log')).map(p=>p.slice(0,-4));
        return observation.presentResult({content:[{type:'text',text:JSON.stringify({stage:label,workerClaim:summary,
          retainedOutputCount:ids.length,recentOutputIds:ids.slice(-6),retrieve:'worker_output({stage,id,offset}) retrieves retained worker output without another model delegation',
          warning:'Worker claim; inspect source and run verify for evidence.'})}]},{kind:'delegate'});
      }finally{busy=false;}
    }};
  const verifyTool={name:'verify',label:'Verify public contracts',description:'Run only the fixed caller-supplied public checks on the current implementation. Returns exact exit status and diagnostics. A pass covers only those checks.',parameters:Type.Object({}),
    async execute(){return observation.presentResult({content:[{type:'text',text:JSON.stringify(await verify())}]},{kind:'verification'});}};
  const workerOutput={name:'worker_output',label:'Retrieve worker output',description:'List or retrieve original retained worker tool output by stage and artifact id. Read-only, bounded byte ranges; choose base64 for exact binary bytes.',
    parameters:Type.Object({stage:Type.String(),id:Type.Optional(Type.String()),offset:Type.Optional(Type.Integer({minimum:0})),maxBytes:Type.Optional(Type.Integer({minimum:1,maximum:4096})),encoding:Type.Optional(Type.Union([Type.Literal('utf8'),Type.Literal('base64')]))}),
    async execute(_id,{stage:label,id,offset=0,maxBytes=2048,encoding='utf8'}) {
      if(!stages.some(s=>s.label===label&&label.startsWith('delegate-')))throw Error('Unknown completed worker stage');
      const dir=resolve(runDir,label,'output');
      const ids=(await readdir(dir).catch(()=>[])).filter(p=>p.endsWith('.log')).map(p=>p.slice(0,-4));
      if(!id)return {content:[{type:'text',text:JSON.stringify({stage:label,ids})}]};
      if(!ids.includes(id)||!Number.isInteger(offset)||offset<0||!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>4096||!['utf8','base64'].includes(encoding))throw Error('Invalid worker output request');
      const path=resolve(dir,id+'.log');
      if(relative(await realpath(dir),await realpath(path))!==id+'.log')throw Error('Worker output path escaped its directory');
      const file=await open(path,'r');
      try {
        const size=(await file.stat()).size,buffer=Buffer.alloc(maxBytes);
        const {bytesRead}=await file.read(buffer,0,maxBytes,offset);
        return {content:[{type:'text',text:JSON.stringify({stage:label,id,offset,nextOffset:offset+bytesRead,totalBytes:size,hasMore:offset+bytesRead<size,encoding,data:buffer.subarray(0,bytesRead).toString(encoding)})}]};
      }finally{await file.close();}
    }};
  const coordinatorTools=[...observation.wrapTools(readOnly),delegate,verifyTool,observation.readTool,workerOutput];
  try {
    final=await stage('coordinate',r.model,r.effort,r.prompt,coordinatorTools,COORDINATOR_PROMPT);
    const checked=await verify();
    if(checked.outcomes.length&&!checked.passed)status='verification_failed';
  }catch(e){status=usage.costUnknown?'cost_unknown':/allowance|timeout/i.test(e.message)?'budget_stopped':'operational_failure';notes.push({kind:'failure',error:e.message});}
  const verificationStatus=!r.checks.length?'not_configured':!verification.length?'not_run':verification.at(-1).passed?'passed':'failed';
  // Response callbacks attribute usage to exactly one stage. Coordinator elapsed
  // time contains worker time; do not sum nested stage latency as wall time.
  const workerCost=stages.filter(s=>s.label.startsWith('delegate-')).reduce((n,s)=>n+s.usage.estimatedApiUsd,0);
  const result={strategy:'orchestrated',version:'orchestrated-v1',profile:'orchestrated',features:{outputControl:true},model:r.model,effort:r.effort,
    status,usage,stages,verification,verificationStatus,completionEvidence:verificationStatus==='passed'?'public_checks_passed':verificationStatus==='failed'?'public_checks_failed':'unverified',
    delegations,implementationDelegations:implementations,investigationDelegations:delegations-implementations,coordinatorCostUsd:usage.estimatedApiUsd-workerCost,workerCostUsd:workerCost,notes,repairs:Math.max(0,implementations-1),
    escalations:0,adviceCalls:0,final,latencyMs:now()-start,
    budgetEligible:status==='completed'&&!usage.costUnknown&&usage.estimatedApiUsd<=r.maxCostUsd&&now()<=deadline&&usage.modelCalls<=r.maxTurns&&usage.toolCalls<=r.maxCalls};
  await save(resolve(runDir,'worker.json'),result);return result;
}
