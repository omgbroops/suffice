import {mkdtemp,cp,rm,symlink} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,basename} from 'node:path';
import {clampThinkingLevel} from '@earendil-works/pi-ai';
import {createSufficeSession} from './session.mjs';
import {applyPatch,diffFiles,workspacePrefill} from './fast-command.mjs';

// /efficient — the eco arm (cheap-first, escalate on failure) as an in-session
// command. The benchmark version gates Luna on acceptance tests; in-session
// there is no verifier, so "produced a real diff" is the success proxy — the
// same verdict /fast applies to its race winner.
//   /efficient            show state
//   /efficient on|off     switch the live session's model to the cheap one and back
//   /efficient cheap <id> pick the cheap model (default gpt-6-luna)
//   /balanced             restore regular Suffice: default model + effort
//   /efficient <task>     the cheap model attempts the task on a workspace
//                         copy; if it completes with changes, they are applied
//                         back. Only when it fails (error, or no changes after
//                         a retry
//                         nudge) does the session's strong model run, on a
//                         fresh copy — escalate-on-failure, never review-on-
//                         success, so Sol's cost is paid only on real misses.
const SKIP_COPY=new Set(['.git','node_modules']);
const CHEAP_ROUNDS=2; // initial attempt + one "keep fixing" retry

export function sufficeEfficientCommand(options,runtime){
  let cheapOn=false,priorModel=null,running=false,cheapId='gpt-6-luna';
  // Cheap model is user-selectable (`/efficient cheap <id>`); the strong side
  // is always whatever model the session itself is running.
  const cheapModel=()=>runtime.getModel('openai',cheapId);
  const spawn=(dir,task,modelObject,effort)=>createSufficeSession({...options,cwd:dir,sessionManager:undefined,continue:false,effort,speed:'standard',browser:false,desktop:false,modelObject,extensions:[],timeout:options.timeout??600},runtime);
  // One phase of eco: run the given model on `dir`, resolve with a diff count.
  // Escalation decisions are the caller's — a 0-diff completion is a miss.
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
      description:'Efficient mode: /efficient <task> runs the cheap model first and escalates only on failure; /efficient on|off switches session model to the cheap one',
      handler:async(args,ctx)=>{
        const input=args.trim();
        if(!input||input==='status'){
          ctx.ui.notify(`Efficient mode ${cheapOn?'on':'off'} · cheap=${cheapId} · /efficient <task> runs cheap first, escalates on failure · /efficient cheap <id> picks the cheap model`,'info');
          return;
        }
        if(input==='cheap'||input.startsWith('cheap ')){
          const id=input.slice(5).trim();
          if(!id){ctx.ui.notify(`Cheap model is ${cheapId} — /efficient cheap <model-id> to change`,'info');return;}
          if(!runtime.getModel('openai',id)){ctx.ui.notify(`Model ${id} is absent from the catalog`,'error');return;}
          cheapId=id;
          ctx.ui.notify(`Cheap model set to ${cheapId}`,'info');
          return;
        }
        if(input==='on'||input==='off'){
          const want=input==='on';
          if(want===cheapOn){ctx.ui.notify(`Efficient mode already ${want?'on':'off'}`,'info');return;}
          if(want){
            const luna=cheapModel();
            if(!luna){ctx.ui.notify(`Model ${cheapId} is absent from the catalog`,'error');return;}
            priorModel=ctx.model;
            if(!(await pi.setModel(luna))){priorModel=null;ctx.ui.notify('Could not switch session model','error');return;}
            cheapOn=true;
            ctx.ui.notify(`Efficient mode on — session model is ${cheapId}; /efficient <task> escalates on failure`,'info');
          } else {
            if(priorModel) await pi.setModel(priorModel);
            priorModel=null;cheapOn=false;
            ctx.ui.notify('Efficient mode off — model restored','info');
          }
          return;
        }
        if(running){ctx.ui.notify('An efficient run is already in progress','warning');return;}
        const luna=cheapModel();
        if(!luna){ctx.ui.notify(`Model ${cheapId} is absent from the catalog`,'error');return;}
        running=true;
        const worktree=ctx.cwd;
        const runDir=await mkdtemp(join(tmpdir(),'suffice-efficient-'));
        try{
          await ctx.waitForIdle();
          const snapshot=join(runDir,'base');
          await cp(worktree,snapshot,{recursive:true,filter:src=>!SKIP_COPY.has(basename(src)),dereference:true});
          const prefill=await workspacePrefill(worktree);
          const prompt=`${input}\n\n${prefill}`;
          // Phase A: cheap model, retry nudged once on a miss. A round only
          // passes its verdict when the session completed — a crashed run's
          // leftover edits are partial work for the next round to finish,
          // never an accepted patch.
          let changes=0,errored=false;
          const cheapEffort=clampThinkingLevel(luna,'low');
          for(let round=0;round<CHEAP_ROUNDS&&changes===0;round++){
            const dir=join(runDir,'cheap');
            if(!existsSync(dir)) await copyTree(worktree,dir);
            ctx.ui.notify(`Efficient: ${cheapId} attempt${round?' retry':''} on a workspace copy`,'info');
            const nudge=errored?'\n\nYour previous attempt errored before finishing — the files may hold partial edits. Inspect the state and finish the task.':'\n\nYour previous attempt made no changes — the task is not done. Keep fixing the actual files.';
            errored=false;
            try{ changes=await attempt(dir,round?prompt+nudge:prompt,luna,cheapEffort,snapshot); }
            catch{ errored=true;changes=0; }
          }
          let winnerDir=null,path='';
          if(changes>0){ winnerDir=join(runDir,'cheap'); path=`${cheapId} solved it (${changes} change(s)) — no escalation, strong-model cost skipped`; }
          else{
            // Phase B: escalate — fresh copy, fresh session, session model.
            const strongDir=join(runDir,'strong');
            await copyTree(worktree,strongDir);
            ctx.ui.notify(`Efficient: ${cheapId} failed — escalating to session model`,'info');
            // '/efficient on' swapped ctx.model to the cheap one — escalate to
            // the model the session had before the switch.
            const strongModel=(cheapOn&&priorModel)?priorModel:ctx.model;
            const strongEffort=clampThinkingLevel(strongModel,ctx.thinkingLevel??'low');
            try{
              const strongChanges=await attempt(strongDir,prompt,strongModel,strongEffort,snapshot);
              if(strongChanges>0){ winnerDir=strongDir; path=`escalated to ${strongModel?.id??'session model'} after ${cheapId} missed (${strongChanges} change(s))`; }
            }catch{ /* fall through to the failure notice */ }
          }
          if(!winnerDir){ctx.ui.notify('Efficient: cheap and the escalation both produced no changes','error');return;}
          const n=await applyPatch(worktree,snapshot,winnerDir);
          const text=`/efficient applied ${n} change(s) — ${path}`;
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
