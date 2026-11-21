import {mkdtemp,cp,rm,symlink} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,basename} from 'node:path';
import {clampThinkingLevel} from '@earendil-works/pi-ai';
import {createSufficeSession} from './session.mjs';
import {applyPatch,diffFiles,workspacePrefill,RACE_ATTEMPTS} from './fast-command.mjs';
import {verifyDir} from './verify.mjs';

// /auto — one cheap Luna call classifies the task, then dispatches to the
// mode that fits: repairs go cheap-first with escalation (the /efficient
// path), features go straight to the session model, ambiguous work gets the
// 3-attempt race (the /fast path). The classify call costs ~$0.0002 and picks
// the ~$0.03 decision. Every path gates on workspace tests when they exist.
//   /auto          show state
//   /auto <task>   classify + dispatch
const SKIP_COPY=new Set(['.git','node_modules']);
const CHEAP_ROUNDS=2; // initial attempt + one verdict-retry
const CHEAP_ID='gpt-6-luna';
const ROUTES=new Set(['repair','feature','other']);

// Pure for tests: pull a route out of the classifier's reply text.
export function parseRoute(text){
  try{
    const parsed=JSON.parse(text);
    return ROUTES.has(parsed?.route)?parsed.route:'other';
  }catch{ return 'other'; }
}

export function sufficeAutoCommand(options,runtime){
  let running=false;
  const cheap=()=>runtime.getModel('openai',CHEAP_ID);
  const spawn=(dir,task,modelObject,effort)=>createSufficeSession({...options,cwd:dir,sessionManager:undefined,continue:false,effort,speed:'standard',browser:false,desktop:false,modelObject,extensions:[],timeout:options.timeout??600},runtime);
  const attempt=async(dir,task,modelObject,effort,snapshot)=>{
    const control=await spawn(dir,task,modelObject,effort);
    try{ await control.run(task); }finally{ await control.dispose(); }
    const {changed,deleted}=await diffFiles(snapshot,dir);
    return changed.length+deleted.length;
  };
  const copyTree=async(worktree,dir)=>{
    await cp(worktree,dir,{recursive:true,filter:src=>!SKIP_COPY.has(basename(src)),dereference:true});
    if(existsSync(join(worktree,'node_modules'))) await symlink(join(worktree,'node_modules'),join(dir,'node_modules'),'junction').catch(()=>{});
  };
  // One cheap classify call; anything unparseable lands on 'other' (race),
  // the most conservative dispatch.
  const classify=async(input,prefill)=>{
    const luna=cheap();
    if(!luna) return 'other';
    try{
      const response=await runtime.completeSimple(luna,{
        systemPrompt:'You classify coding tasks. Reply with exactly one JSON object: {"route":"repair"}, {"route":"feature"}, or {"route":"other"}. repair = fixing existing behavior: tasks phrased as fix/repair/bug/regression, or describing incorrect behavior to correct — even when the fix adds a parameter or new code path. feature = a purely new capability not framed as a fix. other = ambiguous, refactor, docs, or analysis. When unsure between repair and feature, choose repair; when unsure otherwise, choose other.',
        messages:[{role:'user',content:`Task:\n${input}\n\n${prefill}`.slice(0,8000),timestamp:Date.now()}],
      },{maxTokens:64,reasoning:'low'});
      return parseRoute((response.content??[]).filter(c=>c.type==='text').map(c=>c.text).join(''));
    }catch{ return 'other'; }
  };
  // repair → cheap model first, verdict-retry once, escalate to session model.
  const runRepair=async(worktree,snapshot,runDir,prompt,ctx)=>{
    const luna=cheap();
    if(!luna) return null;
    let changes=0,errored=false,failedDetail=null;
    const cheapEffort=clampThinkingLevel(luna,'low');
    for(let round=0;round<CHEAP_ROUNDS&&changes===0;round++){
      const dir=join(runDir,'cheap');
      if(!existsSync(dir)) await copyTree(worktree,dir);
      ctx.ui.notify(`Auto(repair): ${CHEAP_ID} attempt${round?' retry':''}`,'info');
      const nudge=errored?'\n\nYour previous attempt errored before finishing — the files may hold partial edits. Inspect the state and finish the task.':failedDetail?`\n\nYour previous attempt's changes fail the project's tests:\n${failedDetail}\nKeep fixing until the tests pass.`:'\n\nYour previous attempt made no changes — the task is not done. Keep fixing the actual files.';
      errored=false;failedDetail=null;
      try{ changes=await attempt(dir,round?prompt+nudge:prompt,luna,cheapEffort,snapshot); }
      catch{ errored=true;changes=0; }
      if(changes>0){
        const verdict=await verifyDir(dir);
        if(verdict.ranTests&&!verdict.passed){ failedDetail=verdict.detail; changes=0; }
      }
    }
    if(changes>0) return {dir:join(runDir,'cheap'),path:`${CHEAP_ID} solved it (${changes} change(s))`};
    // Escalate on failure only — same shape as /efficient.
    const strongDir=join(runDir,'strong');
    await copyTree(worktree,strongDir);
    ctx.ui.notify(`Auto(repair): ${CHEAP_ID} failed — escalating to session model`,'info');
    const strongEffort=clampThinkingLevel(ctx.model,ctx.thinkingLevel??'low');
    try{
      const strongChanges=await attempt(strongDir,prompt,ctx.model,strongEffort,snapshot);
      if(strongChanges>0){
        const verdict=await verifyDir(strongDir);
        if(verdict.ranTests&&!verdict.passed) ctx.ui.notify(`Escalation produced changes but they fail the workspace tests:\n${verdict.detail}`,'warning');
        else return {dir:strongDir,path:`escalated to ${ctx.model?.id??'session model'} (${strongChanges} change(s))`};
      }
    }catch{ /* miss */ }
    return null;
  };
  // feature → session model directly on a copy; verification gates the diff.
  const runFeature=async(worktree,snapshot,runDir,prompt,ctx)=>{
    const dir=join(runDir,'feature');
    await copyTree(worktree,dir);
    ctx.ui.notify(`Auto(feature): ${ctx.model?.id??'session model'} on a workspace copy`,'info');
    const effort=clampThinkingLevel(ctx.model,ctx.thinkingLevel??'low');
    try{
      const changes=await attempt(dir,prompt,ctx.model,effort,snapshot);
      if(changes>0){
        const verdict=await verifyDir(dir);
        if(verdict.ranTests&&!verdict.passed){ ctx.ui.notify(`Feature attempt produced changes but they fail the workspace tests:\n${verdict.detail}`,'warning'); return null; }
        return {dir,path:`${ctx.model?.id??'session model'} (${changes} change(s))`};
      }
    }catch{ /* miss */ }
    return null;
  };
  // other → 3-attempt race at low effort; first verified diff wins.
  const runRace=async(worktree,snapshot,runDir,input,prefill,ctx)=>{
    const controls=[];
    let winner=-1,sawVerifyRun=false;
    const jobs=RACE_ATTEMPTS.map(async(spec,i)=>{
      const dir=join(runDir,`attempt-${i}`);
      await copyTree(worktree,dir);
      const control=await spawn(dir,input,ctx.model,'low');
      controls[i]=control;
      try{
        await control.run(input+'\n\n'+prefill+(spec.hint?'\n\n'+spec.hint:''));
        const {changed,deleted}=await diffFiles(snapshot,dir);
        if(winner<0&&(changed.length||deleted.length)){
          const verdict=await verifyDir(dir);
          if(verdict.ranTests){ sawVerifyRun=true; if(!verdict.passed) return; }
          if(winner<0){
            winner=i;
            for(let j=0;j<controls.length;j++) if(j!==i) controls[j]?.abort();
          }
        }
      }catch{ /* losing or failed attempt */ }
    });
    await Promise.allSettled(jobs);
    await Promise.allSettled(controls.filter(Boolean).map(c=>c.dispose()));
    if(winner<0) return {failed:sawVerifyRun?'attempts produced changes but failed the workspace tests':'all attempts failed or produced no changes'};
    return {dir:join(runDir,`attempt-${winner}`),path:`race attempt ${winner+1} finished first`};
  };
  return pi=>{
    pi.registerCommand('auto',{
      description:'Auto mode: /auto <task> classifies the task (one cheap call) then dispatches — repairs to the cheap path, features to the session model, ambiguous to the race',
      handler:async(args,ctx)=>{
        const input=args.trim();
        if(!input||input==='status'){
          ctx.ui.notify('Auto mode — /auto <task>: cheap classify → repair goes cheap-first+escalate, feature goes to the session model, ambiguous races 3 attempts','info');
          return;
        }
        if(running){ctx.ui.notify('An auto run is already in progress','warning');return;}
        running=true;
        const worktree=ctx.cwd;
        const runDir=await mkdtemp(join(tmpdir(),'suffice-auto-'));
        try{
          await ctx.waitForIdle();
          const snapshot=join(runDir,'base');
          await cp(worktree,snapshot,{recursive:true,filter:src=>!SKIP_COPY.has(basename(src)),dereference:true});
          const prefill=await workspacePrefill(worktree);
          const route=await classify(input,prefill);
          ctx.ui.notify(`Auto: classified as ${route} → ${route==='repair'?'cheap-first with escalation':route==='feature'?'session model':'3-attempt race'}`,'info');
          const prompt=`${input}\n\n${prefill}`;
          let outcome;
          if(route==='repair') outcome=await runRepair(worktree,snapshot,runDir,prompt,ctx);
          else if(route==='feature') outcome=await runFeature(worktree,snapshot,runDir,prompt,ctx);
          else outcome=await runRace(worktree,snapshot,runDir,input,prefill,ctx);
          if(!outcome?.dir){
            ctx.ui.notify(`Auto: ${outcome?.failed??'no path produced verified changes'}`,'error');
            return;
          }
          const n=await applyPatch(worktree,snapshot,outcome.dir);
          const text=`/auto applied ${n} change(s) — ${route} route · ${outcome.path}`;
          pi.sendMessage({customType:'auto-run',content:text,display:true});
          ctx.ui.notify(text,'info');
        } finally {
          running=false;
          await rm(runDir,{recursive:true,force:true});
        }
      }
    });
  };
}
