import {mkdir,writeFile,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute,sep} from 'node:path';
import {createSufficeSession} from '../../packages/cli/src/session.mjs';
import {repositoryTools} from '../../packages/cli/src/tools.mjs';
import {createPipelineSession} from './session.mjs';
import {normalizeRequest,PIPELINE_POLICY,THIN_PROMPT,ADVICE_PROMPT} from './policy.mjs';
import {prepareExecutionInput,executionNotices,withExecutionOutput} from '../execution/core.mjs';
import {verifyPublicContracts} from '../execution/verification.mjs';

const save=async(p,v)=>{await mkdir(resolve(p,'..'),{recursive:true});await writeFile(p,JSON.stringify(v,null,2)+'\n',{mode:0o600});};
const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
const contained=(root,p)=>{const r=relative(root,p);return r===''||(!isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+sep));};
export async function runPublicCheck({workspace,check,timeoutMs,signal}) {
  const bash=repositoryTools({workspace,commandTimeout:Math.max(1,timeoutMs/1000)}).find(t=>t.name==='bash');
  let result,error;
  try {result=await bash.execute('public-check',{command:check.command.map(quote).join(' '),timeout:Math.max(.01,timeoutMs/1000)},signal);}catch(e){error=e.message;}
  const data=result?.structuredContent??result?.details??{};
  const exitCode=data.exit_code??data.exitCode??null;
  return {command:check.command,expectedExitCode:check.expectedExitCode??0,exitCode,passed:!error&&Number.isInteger(exitCode)&&exitCode===(check.expectedExitCode??0),output:result?.content?.filter(c=>c.type==='text').map(c=>c.text).join('\n')??error??'',error:error??null};
}

// A controller owns the stages; every model response draws from one allowance.
// Dependencies make failure/escalation/budget paths testable without inference.
export async function executePipeline(request,deps={}) {
  const r=normalizeRequest(request),{features:f}=r;
  const workspace=await realpath(r.workspace),runDir=resolve(r.runDir);
  await mkdir(runDir,{recursive:true});
  if(contained(workspace,await realpath(runDir)))throw Error('runDir must be outside the working repository');
  await writeFile(resolve(runDir,'request.json'),JSON.stringify({profile:r.profile,features:f,model:r.model,effort:r.effort,maxCostUsd:r.maxCostUsd,timeoutMs:r.timeoutMs,maxTurns:r.maxTurns,maxCalls:r.maxCalls,checks:r.checks,...(r.strategy?{strategy:r.strategy}:{}),...(r.provider?{provider:r.provider}:{}),...(r.contractVerification?{contractVerification:r.contractVerification}:{})},null,2)+'\n',{flag:'wx',mode:0o600});
  const clock=deps.now??Date.now,started=clock(),deadline=started+r.timeoutMs;
  const usage={input:0,cacheRead:0,cacheWrite:0,output:0,estimatedApiUsd:0,modelCalls:0,toolCalls:0,costUnknown:false};
  const stages=[],verification=[],notes=[],extensions=[];
  let status='completed',advice='',repairs=0,escalations=0,final='';
  const remaining=()=>r.maxCostUsd-usage.estimatedApiUsd;
  function assertAllowance(requireModel=false) {
    if(usage.costUnknown)throw Error('Unknown inference cost; task stopped');
    if(remaining()<0||clock()>=deadline||usage.modelCalls>r.maxTurns||usage.toolCalls>r.maxCalls||(requireModel&&(remaining()<=0||usage.modelCalls>=r.maxTurns)))throw Error('Shared task allowance exhausted');
  }
  let prepared=r.prompt;
  async function prepare(label) {
    return prepareExecutionInput(r,workspace,runDir,label);
  }
  async function stage(label,model,effort,text,{advisor=false}={}) {
    assertAllowance(true);const stageDir=resolve(runDir,label),before={...usage},begin=clock();
    let control,replyCount=0,providerRequests=0,error=null,stageFinal='';
    const gate=pi=>{pi.on('before_provider_request',()=>{assertAllowance(true);if(advisor&&replyCount>=1)throw Error('Advice response allowance exhausted');providerRequests++;});pi.on('tool_call',()=>{
      usage.toolCalls++;
      if(usage.toolCalls>r.maxCalls||clock()>=deadline||remaining()<=0||usage.costUnknown){queueMicrotask(()=>control?.abort());return {block:true,reason:'Shared task allowance exhausted'};}
    });};
    let opt={cwd:workspace,home:resolve(stageDir,'state'),model,provider:advisor?'openai':r.provider??'openai',effort,maxCost:remaining(),timeout:Math.max(.01,(deadline-clock())/1000),maxTurns:advisor?1:r.maxTurns-usage.modelCalls,maxCalls:r.maxCalls-usage.toolCalls,profile:r.profile,noTools:advisor,
      systemPrompt:advisor?ADVICE_PROMPT:r.profile==='thin'?THIN_PROMPT:undefined,extensions:[gate,...extensions],...(advisor?{allowedTools:[],noContextFiles:true}:{})};
    opt=await withExecutionOutput(opt,{workspace,artifactDir:resolve(runDir,'observations'),enabled:!advisor&&f.outputControl,record:e=>notes.push(e)});
    const factory=deps.createSession??(r.profile==='baseline'&&!advisor&&!f.outputControl&&opt.provider==='openai'?createSufficeSession:createPipelineSession);
    try {
      control=await factory(opt,r.runtime,{onAssistant(m){
        replyCount++;usage.modelCalls++;const u=m.usage;
        for(const k of ['input','cacheRead','cacheWrite','output'])usage[k]+=u?.[k]??0;
        if(Number.isFinite(u?.cost?.total)&&u.cost.total>=0)usage.estimatedApiUsd+=u.cost.total;else usage.costUnknown=true;
        if(['error','aborted'].includes(m.stopReason))usage.costUnknown=true;
        if(m.content?.some(c=>c.type==='toolCall')&&(advisor||replyCount>=opt.maxTurns||usage.modelCalls>=r.maxTurns||remaining()<=0||usage.costUnknown))control?.abort();
      }});
      stageFinal=await control.run(text);
    }catch(e){error=e.message;}
    finally {
      if(control)try {await control.dispose();}catch(e){error??=e.message;}
      if(providerRequests>replyCount)usage.costUnknown=true;
      const delta=Object.fromEntries(Object.keys(usage).filter(k=>typeof usage[k]==='number').map(k=>[k,usage[k]-before[k]]));
      const entry={label,model,effort,advisor,latencyMs:clock()-begin,replyCount,providerRequests,final:stageFinal,error,usage:delta,eventPath:control?.eventPath??null};
      stages.push(entry);await save(resolve(stageDir,'stage.json'),entry);
    }
    if(error)throw Error(`${label}: ${error}`);
    assertAllowance();return stageFinal;
  }
  async function check(label) {
    const outcomes=[];
    for(const c of r.checks) {
      assertAllowance();const begin=clock(),time=Math.min(c.timeoutMs??60000,deadline-clock());
      const out=await (deps.runCheck??runPublicCheck)({workspace,check:c,timeoutMs:time});
      outcomes.push({...out,latencyMs:clock()-begin});
    }
    const contracts=await verifyPublicContracts({plan:r.contractVerification,workspace,runCheck:deps.runCheck??runPublicCheck,deadline,now:clock});
    outcomes.push(...contracts.outcomes);
    const record={label,outcomes,passed:outcomes.length>0&&outcomes.every(x=>x.passed),...(r.contractVerification?{contracts}:{})};
    verification.push(record);await save(resolve(runDir,`checks-${label}.json`),record);return record;
  }
  const failed=result=>result.outcomes.some(x=>!x.passed);
  const feedback=result=>JSON.stringify(result.outcomes.filter(x=>!x.passed).map(x=>({command:x.command,exitCode:x.exitCode,output:x.output.slice(-5000)})));
  async function advise(label,failures='No implementation has been made yet.') {
    prepared=await prepare(label);
    advice=await stage(label,PIPELINE_POLICY.advisor,PIPELINE_POLICY.advisorEffort,`${prepared}\n\nPublic execution evidence:\n${failures}\nGive only a short diagnosis and concrete next steps. No code.`,{advisor:true});
    return advice.slice(0,1800);
  }
  try {
    extensions.push(...executionNotices({workspace,enabled:f.notices,record:e=>notes.push(e)}));
    if(f.advice==='upfront')await advise('advice-upfront');
    prepared=await prepare('solve');
    final=await stage('solve',r.model,r.effort,prepared+(advice?`\n\nAdvisory hypotheses; verify against source:\n${advice.slice(0,1800)}`:''));
    let checked=await check('initial');
    if(failed(checked)&&f.advice==='on_failure')await advise('advice-failure',feedback(checked));
    while(failed(checked)&&f.repairs&&repairs<r.maxRepairAttempts) {
      repairs++;
      prepared=await prepare(`repair-${repairs}`);
      final=await stage(`repair-${repairs}`,r.model,f.effortScheduling?'low':r.effort,`${prepared}\n\nYour implementation remains in this working tree. Inspect the current source, preserve public contracts and repair these failed public checks.\n${feedback(checked)}${advice?`\nAdvisory hypotheses:\n${advice.slice(0,1800)}`:''}`);
      checked=await check(`repair-${repairs}`);
    }
    if(failed(checked)&&f.solTakeover&&r.model!==PIPELINE_POLICY.advisor) {
      escalations++;
      prepared=await prepare('takeover');
      final=await stage('sol-takeover',PIPELINE_POLICY.advisor,PIPELINE_POLICY.advisorEffort,`${prepared}\n\nA previous implementation remains in this repository. Inspect and repair it, preserving all public requirements. Public check failures:\n${feedback(checked)}`);
      checked=await check('takeover');
    }
    if(failed(checked))status='verification_failed';
  }catch(e){status=/allowance|cost_limit|turn_limit|tool_limit|timeout/i.test(e.message)?'budget_stopped':usage.costUnknown?'cost_unknown':'operational_failure';notes.push({kind:'failure',error:e.message});}
  const result={version:PIPELINE_POLICY.version,...(r.strategy?{strategy:r.strategy}:{}),profile:r.profile,features:f,model:r.model,effort:r.effort,status,usage,stages,verification,notes,repairs,escalations,adviceCalls:stages.filter(s=>s.advisor).length,final,latencyMs:clock()-started,verificationStatus:!r.checks.length&&!r.contractVerification?'not_configured':verification.at(-1)?.passed?'passed':'failed',
    budgetEligible:status==='completed'&&!usage.costUnknown&&usage.estimatedApiUsd<=r.maxCostUsd&&clock()<=deadline&&usage.modelCalls<=r.maxTurns&&usage.toolCalls<=r.maxCalls};
  await save(resolve(runDir,'worker.json'),result);return result;
}
