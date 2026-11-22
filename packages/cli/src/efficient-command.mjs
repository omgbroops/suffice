import {mkdtemp,cp,rm,symlink} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,basename} from 'node:path';
import {clampThinkingLevel} from '@earendil-works/pi-ai';
import {createSufficeSession} from './session.mjs';
import {applyPatch,diffFiles,workspacePrefill,RACE_ATTEMPTS} from './fast-command.mjs';
import {verifyDir} from './verify.mjs';

// /efficient — the cheap-first mode that won the benchmarks: a weaker
// "sidekick" model attempts the task on a workspace copy; only when it misses
// does the real "lead" machinery run — a 3-attempt race where lane 0 inherits
// the sidekick's failed workspace plus the test-failure digest (the seeded
// escalation that cracked tasks neither cheap nor strong solo runs could).
//   /efficient                 show state
//   /efficient on|off          switch the live session's model to the sidekick
//                              and back
//   /efficient sidekick <id>   pick the sidekick model (default gpt-6-luna)
//   /efficient lead <id>       override the escalation model (default: session
//                              model — the one /model picks)
//   /efficient <task>          sidekick attempts adaptively (cheap rounds
//                              continue while each failure signature changes,
//                              then one medium-effort round); a miss escalates
//                              to a seeded lead-model race. Every candidate is
//                              gated on the workspace's own tests when they
//                              exist.
//   /balanced                  restore regular Suffice: default model + effort
const SKIP_COPY=new Set(['.git','node_modules']);
// Sidekick budget: low-effort rounds continue while each round's failure
// signature CHANGES (progress — a new failure digest means the last nudge
// moved something); an identical signature twice means the model is stuck
// and further cheap rounds just burn tokens. One medium-effort round then
// fires before the lead escalation — still ~5-10x cheaper than the lead.
const CHEAP_MAX_ROUNDS=4;

export function sufficeEfficientCommand(options,runtime){
  let cheapOn=false,priorModel=null,running=false,sidekickId='gpt-6-luna',leadId=null;
  // Sidekick is user-selectable; the lead defaults to the session model —
  // either the live one or the model the session had before '/efficient on'
  // swapped it to the sidekick.
  const sidekick=()=>runtime.getModel('openai',sidekickId);
  const lead=ctx=>{
    if(leadId) return runtime.getModel('openai',leadId);
    return (cheapOn&&priorModel)?priorModel:ctx.model;
  };
  const spawn=(dir,task,modelObject,effort)=>createSufficeSession({...options,cwd:dir,sessionManager:undefined,continue:false,effort,speed:'standard',browser:false,desktop:false,modelObject,extensions:[],timeout:options.timeout??600},runtime);
  const attempt=async(dir,task,modelObject,effort,snapshot)=>{
    const control=await spawn(dir,task,modelObject,effort);
    try{ await control.run(task); }finally{ await control.dispose(); }
    const {changed,deleted}=await diffFiles(snapshot,dir);
    return changed.length+deleted.length;
  };
  const copyTree=async(worktree,dir)=>{
    await cp(worktree,dir,{recursive:true,filter:src=>!SKIP_COPY.has(basename(src)),dereference:true});
    // node_modules is shared read-mostly for speed: attempts get a link to
    // the real tree (a full copy of deps would dominate startup).
    if(existsSync(join(worktree,'node_modules'))) await symlink(join(worktree,'node_modules'),join(dir,'node_modules'),'junction').catch(()=>{});
  };
  // Escalation ladder: 3-attempt race on the lead model. Lane 0 continues
  // from the sidekick's failed workspace (the losing diff is a lossless
  // handoff, not a summary) with the test-failure digest; lanes 1-2 race
  // clean for trajectory diversity. First verified diff wins.
  const escalate=async(worktree,snapshot,runDir,input,prefill,ctx,seedDir,seedDigest)=>{
    const strong=lead(ctx);
    if(!strong) return {failed:'no lead model available'};
    const controls=[],verifyCtl=[];
    let winner=-1,sawVerifyRun=false;
    const jobs=RACE_ATTEMPTS.map(async(spec,i)=>{
      const dir=join(runDir,`escalate-${i}`);
      await copyTree(i===0&&seedDir?seedDir:worktree,dir);
      const seeded=i===0&&seedDir;
      const hint=(spec.hint?'\n\n'+spec.hint:'')+(seeded?`\n\nA previous attempt already edited this workspace and failed verification${seedDigest?` — the tests report:\n${seedDigest}`:'.'} Continue from the existing edits, or discard them and take a different approach.`:'');
      // Lead effort = the session's thinking level (Pi's effort setting) —
      // the benchmark's low lanes won, but the user-facing lead honors the
      // effort the user picked for the session.
      const control=await spawn(dir,input,strong,clampThinkingLevel(strong,ctx.thinkingLevel??'low'));
      controls[i]=control;
      try{
        await control.run(input+'\n\n'+prefill+hint);
        const {changed,deleted}=await diffFiles(snapshot,dir);
        if(winner<0&&(changed.length||deleted.length)){
          const verify=(verifyCtl[i]=new AbortController()).signal;
          const verdict=await verifyDir(dir,{access:options.access,signal:verify});
          if(verdict.ranTests){ sawVerifyRun=true; if(!verdict.passed) return; }
          if(winner<0){
            winner=i;
            for(let j=0;j<controls.length;j++) if(j!==i){ controls[j]?.abort(); verifyCtl[j]?.abort(); }
          }
        }
      }catch{ /* losing or failed attempt */ }
    });
    await Promise.allSettled(jobs);
    await Promise.allSettled(controls.filter(Boolean).map(c=>c.dispose()));
    if(winner<0) return {failed:sawVerifyRun?'escalation attempts produced changes but failed the workspace tests':'all escalation attempts failed or produced no changes'};
    return {dir:join(runDir,`escalate-${winner}`),path:`escalated to ${strong?.id??'lead'} — race lane ${winner+1}${winner===0&&seedDir?' (continued the sidekick workspace)':''} finished first`};
  };
  return pi=>{
    pi.registerCommand('balanced',{
      description:'Balanced mode: restore regular Suffice — default model and effort',
      handler:async(_args,ctx)=>{
        const target=runtime.getModel('openai',options.model);
        if(target&&ctx.model?.id!==target.id) await pi.setModel(target);
        if(ctx.thinkingLevel!==options.effort) pi.setThinkingLevel(options.effort);
        cheapOn=false;priorModel=null;
        ctx.ui.notify(`Balanced — regular Suffice: ${target?.id??options.model} · ${options.effort} effort`,'info');
      }
    });
    pi.registerCommand('efficient',{
      description:'Efficient mode: /efficient <task> runs the sidekick model first and escalates to a seeded lead-model race only on failure; /efficient on|off switches the session model to the sidekick',
      handler:async(args,ctx)=>{
        const input=args.trim();
        if(!input||input==='status'){
          ctx.ui.notify(`Efficient mode ${cheapOn?'on':'off'} · sidekick=${sidekickId} · lead=${leadId??'session model'} · /efficient <task> runs sidekick-first with seeded-race escalation`,'info');
          return;
        }
        const pick=(name)=>{
          const id=input.slice(name.length).trim();
          if(!runtime.getModel('openai',id)){ctx.ui.notify(`Model ${id||'(empty)'} is absent from the catalog`,'error');return false;}
          return id;
        };
        if(input==='sidekick'||input.startsWith('sidekick ')||input==='cheap'||input.startsWith('cheap ')){
          const name=input.startsWith('sidekick')?'sidekick':'cheap';
          const id=input.slice(name.length).trim();
          if(!id){ctx.ui.notify(`Sidekick model is ${sidekickId} — /efficient sidekick <model-id> to change`,'info');return;}
          const ok=pick(name);if(!ok)return;
          sidekickId=ok;
          ctx.ui.notify(`Sidekick model set to ${sidekickId}`,'info');
          return;
        }
        if(input==='lead'||input.startsWith('lead ')){
          const id=input.slice(4).trim();
          if(!id){leadId=null;ctx.ui.notify('Lead model reset to the session model','info');return;}
          const ok=pick('lead');if(!ok)return;
          leadId=ok;
          ctx.ui.notify(`Lead model set to ${leadId}`,'info');
          return;
        }
        if(input==='on'||input==='off'){
          const want=input==='on';
          if(want===cheapOn){ctx.ui.notify(`Efficient mode already ${want?'on':'off'}`,'info');return;}
          if(want){
            const sk=sidekick();
            if(!sk){ctx.ui.notify(`Model ${sidekickId} is absent from the catalog`,'error');return;}
            priorModel=ctx.model;
            if(!(await pi.setModel(sk))){priorModel=null;ctx.ui.notify('Could not switch session model','error');return;}
            cheapOn=true;
            ctx.ui.notify(`Efficient mode on — session model is ${sidekickId}; /efficient <task> escalates on failure`,'info');
          } else {
            if(priorModel) await pi.setModel(priorModel);
            priorModel=null;cheapOn=false;
            ctx.ui.notify('Efficient mode off — model restored','info');
          }
          return;
        }
        if(running){ctx.ui.notify('An efficient run is already in progress','warning');return;}
        const sk=sidekick();
        if(!sk){ctx.ui.notify(`Model ${sidekickId} is absent from the catalog`,'error');return;}
        running=true;
        const worktree=ctx.cwd;
        const runDir=await mkdtemp(join(tmpdir(),'suffice-efficient-'));
        try{
          await ctx.waitForIdle();
          const snapshot=join(runDir,'base');
          await cp(worktree,snapshot,{recursive:true,filter:src=>!SKIP_COPY.has(basename(src)),dereference:true});
          const prefill=await workspacePrefill(worktree);
          const prompt=`${input}\n\n${prefill}`;
          // Phase A: sidekick model — adaptive low-effort rounds, then one
          // medium-effort round before escalation. A round only passes its
          // verdict when the session completed: a crashed run's leftover
          // edits are partial work for the next round to finish.
          let changes=0,errored=false,failedDetail=null,prevSig=null;
          const cheapDir=join(runDir,'sidekick');
          // One sidekick round at the given effort. Returns the round's
          // failure signature ('error', the failure digest, or 'nochange');
          // `changes` accumulates the passing diff count. Identical
          // signatures twice in a row mean the model is stuck.
          const sidekickRound=async(round,effort)=>{
            if(!existsSync(cheapDir)) await copyTree(worktree,cheapDir);
            ctx.ui.notify(`Efficient: ${sidekickId} attempt${round?' retry':''} (${effort} effort) on a workspace copy`,'info');
            const nudge=errored?'\n\nYour previous attempt errored before finishing — the files may hold partial edits. Inspect the state and finish the task.':failedDetail?`\n\nYour previous attempt's changes fail the project's tests:\n${failedDetail}\nKeep fixing until the tests pass.`:'\n\nYour previous attempt made no changes — the task is not done. Keep fixing the actual files.';
            errored=false;failedDetail=null;
            try{ changes=await attempt(cheapDir,round?prompt+nudge:prompt,sk,clampThinkingLevel(sk,effort),snapshot); }
            catch{ errored=true;changes=0; }
            // Verify on the copy: a diff that fails the project's tests is a
            // miss, and its failure digest nudges the next round.
            if(changes>0){
              const verdict=await verifyDir(cheapDir,{access:options.access});
              if(verdict.ranTests&&!verdict.passed){ failedDetail=verdict.detail; changes=0; }
            }
            return changes>0?null:(errored?'error':(failedDetail??'nochange'));
          };
          for(let round=0;round<CHEAP_MAX_ROUNDS&&changes===0;round++){
            const sig=await sidekickRound(round,'low');
            if(sig===null) break;
            if(sig===prevSig) break; // same failure signature twice — stuck
            prevSig=sig;
          }
          // One medium-effort round before paying for the lead — a stuck
          // low-effort signature can still move when the model thinks harder.
          if(changes===0) await sidekickRound(CHEAP_MAX_ROUNDS,'medium');
          let outcome=null;
          if(changes>0) outcome={dir:cheapDir,path:`${sidekickId} solved it (${changes} change(s)) — lead cost skipped`};
          else{
            // Phase B: seeded-race escalation on the lead model.
            const seedDir=existsSync(cheapDir)?cheapDir:null;
            ctx.ui.notify(`Efficient: ${sidekickId} missed — escalating to a ${lead(ctx)?.id??'lead'} race${seedDir?' seeded with the failed workspace':''}`,'info');
            outcome=await escalate(worktree,snapshot,runDir,input,prefill,ctx,seedDir,failedDetail);
          }
          if(!outcome?.dir){
            ctx.ui.notify(`Efficient: ${outcome?.failed??'no path produced verified changes'}`,'error');
            return;
          }
          const n=await applyPatch(worktree,snapshot,outcome.dir);
          const text=`/efficient applied ${n} change(s) — ${outcome.path}`;
          pi.sendMessage({customType:'efficient-run',content:text,display:true});
          ctx.ui.notify(text,'info');
        } finally {
          running=false;
          await rm(runDir,{recursive:true,force:true});
        }
      }
    });
  };
}
