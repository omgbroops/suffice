import {mkdir,writeFile,readFile,readdir,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createSufficeSession,PROMPT} from '../../packages/cli/src/session.mjs';
import {repositoryTools} from '../../packages/cli/src/tools.mjs';
import {repositoryPath} from '../../packages/cli/src/workspace.mjs';
import {initialRoute,parsePlan,POLICY} from './policy.mjs';

const save=(p,x)=>writeFile(p,JSON.stringify(x,null,2)+'\n');
const sha=x=>createHash('sha256').update(x).digest('hex');
async function inventory(root,rel='',out=[]) {
  if(out.length>=120)return out;
  for(const e of (await readdir(resolve(root,rel),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
    if(e.name.startsWith('.')||['node_modules','dist','coverage'].includes(e.name)||e.isSymbolicLink())continue;
    const path=[rel,e.name].filter(Boolean).join('/');
    if(e.isDirectory()&&path.split('/').length<4)await inventory(root,path,out);
    else if(e.isFile())out.push(path);
    if(out.length>=120)break;
  }
  return out;
}

export async function executeTask({mode='baseline',experimental=false,workspace,prompt,routingText=prompt,runDir,runtime,checks=[],maxCostUsd=.5,timeoutMs=600000,maxTurns=60,maxCalls=240}) {
  if(!['baseline','routing','packets'].includes(mode))throw Error('Invalid execution mode');
  if(mode!=='baseline'&&!experimental)throw Error('Experimental packet/routing feature flag is required');
  await mkdir(runDir,{recursive:true});
  const started=Date.now(),deadline=started+timeoutMs,route=initialRoute(mode,routingText);
  const usage={input:0,cacheRead:0,cacheWrite:0,output:0,estimatedApiUsd:0,modelCalls:0,toolCalls:0,costUnknown:false};
  const stages=[],verification=[],notes=[];let activated=false,escalations=0,status='completed';
  await save(resolve(runDir,'route.json'),{policy:POLICY,...route});
  const remaining=()=>Math.max(0,maxCostUsd-usage.estimatedApiUsd);
  async function stage(label,model,text,{planning=false,maxStageTurns=maxTurns}={}) {
    if(remaining()<=0||Date.now()>=deadline||usage.modelCalls>=maxTurns||usage.toolCalls>=maxCalls)throw Error('Shared task allowance exhausted');
    const stageDir=resolve(runDir,label);let control,replyCount=0;
    const gate=pi=>pi.on('tool_call',()=>{if(++usage.toolCalls>maxCalls){queueMicrotask(()=>control?.abort());return {block:true,reason:'Shared task tool allowance exhausted'};}});
    const opt={cwd:workspace,home:resolve(stageDir,'state'),model,effort:model===POLICY.sol?POLICY.solEffort:POLICY.lunaEffort,maxCost:remaining(),timeout:Math.max(1,(deadline-Date.now())/1000),extensions:[gate],
      ...(planning?{allowedTools:['read','symbols','symbol_read','symbol_references'],systemPrompt:PROMPT+'\nYou are producing a bounded implementation plan. Use read-only tools to inspect relevant contracts. Do not implement or run commands. Return only the requested JSON plan.'}:{})};
    const beginning=Date.now();
    control=await createSufficeSession(opt,runtime,{onAssistant(m){
      replyCount++;usage.modelCalls++;const u=m.usage;
      for(const k of ['input','cacheRead','cacheWrite','output'])usage[k]+=u?.[k]??0;
      if(Number.isFinite(u?.cost?.total))usage.estimatedApiUsd+=u.cost.total;else usage.costUnknown=true;
      if(['error','aborted'].includes(m.stopReason))usage.costUnknown=true;
      if(m.content.some(c=>c.type==='toolCall')&&(replyCount>=maxStageTurns||usage.modelCalls>=maxTurns||remaining()<=0))control.abort();
    }});
    let final='',error=null;
    try {final=await control.run(text);}catch(e){error=e.message;}
    finally {await control.dispose();}
    const result={label,model,effort:opt.effort,latencyMs:Date.now()-beginning,replyCount,final,error,usage:control.totals,eventPath:control.eventPath};
    stages.push(result);await save(resolve(stageDir,'stage.json'),result);
    if(error)throw Error(`${label}: ${error}`);
    return final;
  }
  async function verify(label) {
    const outcomes=[],bash=repositoryTools({workspace,commandTimeout:60}).find(t=>t.name==='bash');
    for(let i=0;i<checks.length;i++) {
      if(Date.now()>=deadline)throw Error('Shared task timeout before verification');
      const c=checks[i],command=c.command.map(x=>"'"+String(x).replaceAll("'","'\\''")+"'").join(' ');
      const begin=Date.now();let result,error;
      try {result=await bash.execute(`verify-${i}`,{command,timeout:Math.max(1,Math.min(60,(deadline-Date.now())/1000))});}catch(e){error=e.message;}
      const text=result?.content?.filter(x=>x.type==='text').map(x=>x.text).join('\n')??error??'';
      const details=result?.structuredContent??result?.details??{};
      const exit=details.exit_code??details.exitCode??(result?.isError?1:error?1:0);
      outcomes.push({command:c.command,expectedExitCode:c.expectedExitCode??0,exitCode:exit,passed:exit===(c.expectedExitCode??0)&&!error,latencyMs:Date.now()-begin,output:text});
    }
    verification.push({label,outcomes});await save(resolve(runDir,`checks-${label}.json`),outcomes);
    return outcomes;
  }
  try {
    if(mode!=='packets'||!route.complexity.complex) {
      await stage('solve',route.model,prompt);
    } else {
      let plan;
      try {
        const paths=await inventory(workspace);
        const text=await stage('plan',POLICY.sol,`${prompt}\n\nPublic repository inventory (bounded, not complete):\n${paths.join('\n')}\n\nPlan at most two cohesive implementation packets. Combine tightly coupled edits. Do not turn individual reads or test commands into separate model jobs. Include exact source paths to inspect and preserve existing behavior. Return JSON: {"invariants":["contract"],"packets":[{"id":"repair","goal":"bounded implementation goal","files":["relative/path"]}]}. Final native verification is run by code.`,{planning:true,maxStageTurns:8});
        plan=parsePlan(text);await save(resolve(runDir,'plan.json'),plan);
      } catch(e) {
        notes.push({kind:'planning_fallback',error:e.message});
        if(usage.costUnknown)throw e;
      }
      if(!plan)await stage('fallback-solve',POLICY.sol,prompt);
      else {
        activated=true;const completed=[];
        for(let i=0;i<plan.packets.length;i++) {
          const packet=plan.packets[i],evidence=[];
          for(const file of packet.files) {try {const p=await repositoryPath(workspace,file);if((await stat(p)).isFile())evidence.push({path:file,sha256:sha(await readFile(p))});}catch{}}
          const text=`${prompt}\n\nBounded packet ${i+1}/${plan.packets.length}: ${JSON.stringify(packet)}\nPreserve these public contracts: ${JSON.stringify(plan.invariants)}\nPrior packet records: ${JSON.stringify(completed)}\nExact source references: ${JSON.stringify(evidence)}\nImplement this packet. Read the actual code and tests; these references and planner statements are navigation hints, not replacements for source or proof of correctness. You may inspect any authorized repository file needed to complete the contract. Leave a concise result with verification evidence.`;
          const final=await stage(`packet-${i+1}`,POLICY.luna,text);
          completed.push({id:packet.id,result:final.slice(0,1200),fullRecord:resolve(runDir,`packet-${i+1}`,'stage.json')});
        }
      }
    }
    const results=await verify('initial');
    if(mode!=='baseline'&&results.some(r=>!r.passed)&&remaining()>.005&&Date.now()<deadline) {
      escalations++;const feedback=results.filter(r=>!r.passed).map(r=>({command:r.command,exit:r.exitCode,expected:r.expectedExitCode,output:r.output.slice(-4000)}));
      await stage('escalation',POLICY.sol,`${prompt}\n\nThe implementation is present in this same working tree. A deterministic public-check packet failed. Inspect the actual current source, repair the public failures, and preserve the original requirements. No hidden checks are available.\n${JSON.stringify(feedback)}`);
      await verify('repair');
    }
  }catch(e){status=/allowance|cost_limit|turn_limit|tool_limit|timeout/.test(e.message)?'budget_stopped':'operational_failure';notes.push({error:e.message});}
  const result={mode,policy:POLICY,route,packetizationActivated:activated,packetStages:stages.filter(s=>s.label.startsWith('packet-')).length,escalations,status,usage,stages,verification,notes,latencyMs:Date.now()-started,budgetEligible:status==='completed'&&!usage.costUnknown&&usage.estimatedApiUsd<=maxCostUsd&&Date.now()<=deadline&&usage.modelCalls<=maxTurns&&usage.toolCalls<=maxCalls};
  await save(resolve(runDir,'worker.json'),result);return result;
}
