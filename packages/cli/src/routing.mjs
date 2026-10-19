// Selection rule copied from the frozen suffice-v2 packets-v1 experiment.
// No model calls, repository scans, prompt rewriting or worker sessions.
export const ROUTING_POLICY = Object.freeze({
  version:'routing-v1', sol:'gpt-6.1-sol', solEffort:'low',
  luna:'gpt-6-luna', lunaEffort:'high',
});

export function complexity(task) {
  const categories={
    async:/\b(async|asynchronous|concurren\w*|race|stream\w*|pool|promise|event|queue)\b/i,
    compatibility:/\b(default|compatib\w*|metadata|recursive|reference|pointer|schema|inherit\w*)\b/i,
    failure:/\b(error|throw\w*|reject\w*|abort\w*|cancel\w*|timeout|hang\w*|crash\w*)\b/i,
    broad:/\b(multi.package|integration|cross.module|across modules)\b/i,
  };
  const reasons=Object.entries(categories).filter(([,r])=>r.test(task)).map(([k])=>k);
  if(task.split(/\s+/).length>220) reasons.push('long_specification');
  return {score:reasons.length,complex:reasons.length>=2,reasons};
}

export function selectRoute(text,{complexContext=false,images=false}={}) {
  const c=complexity(text),sol=c.complex||complexContext||images;
  return {policy:ROUTING_POLICY.version,model:sol?ROUTING_POLICY.sol:ROUTING_POLICY.luna,
    effort:sol?ROUTING_POLICY.solEffort:ROUTING_POLICY.lunaEffort,
    complexity:c,complexContext,images};
}

function complexHistory(ctx) {
  return ctx.sessionManager.getBranch().some(e=>{
    if(e.type!=='message'||e.message?.role!=='user') return false;
    const content=e.message.content;
    const text=typeof content==='string'?content:(content??[]).filter(c=>c.type==='text').map(c=>c.text).join('\n');
    return complexity(text).complex || (Array.isArray(content)&&content.some(c=>c.type==='image'));
  });
}

export function createRouting({runtime,preference,record=()=>{},onRoute=()=>{}}) {
  if(!['auto','off'].includes(preference.mode)) throw new Error('Invalid routing mode');
  if(preference.mode==='auto') {
    for(const id of [ROUTING_POLICY.sol,ROUTING_POLICY.luna]) {
      if(!runtime.getModel('openai',id)) throw new Error(`Routing model is absent from the pinned catalog: ${id}. Use --routing off for manual selection.`);
    }
  }
  let ready=false,applying=false,primed=false,complexContext=false,error=null;
  const prime=ctx=>{if(!primed){complexContext=complexHistory(ctx);primed=true;}};
  const status=(ctx)=>{
    if(ctx.mode==='tui')ctx.ui.setStatus('suffice-routing',`Routing ${preference.mode}`);
  };
  return {
    activate(){ready=true;},
    get error(){return error;},
    extension(pi) {
      const manual=(ctx,reason)=>{
        if(!ready||applying||preference.mode==='off')return;
        preference.mode='off';status(ctx);record({phase:'mode',mode:'off',reason});
      };
      pi.on('session_start',(_e,ctx)=>{prime(ctx);status(ctx);});
      pi.on('model_select',(e,ctx)=>{if(e.source!=='restore')manual(ctx,'manual_model');});
      pi.on('thinking_level_select',(_e,ctx)=>manual(ctx,'manual_effort'));
      pi.on('input',async(e,ctx)=>{
        error=null;
        if(preference.mode!=='auto')return {action:'continue'};
        prime(ctx);
        const route=selectRoute(e.text,{complexContext,images:Boolean(e.images?.length)});
        complexContext ||= route.complexity.complex||route.images;
        if(e.streamingBehavior) {
          // Steering must not switch a model while tools/reasoning are in flight.
          record({phase:'deferred',...route});return {action:'continue'};
        }
        applying=true;
        try {
          const model=runtime.getModel('openai',route.model);
          if(!model)throw new Error(`Routing model unavailable: ${route.model}`);
          if(ctx.model?.id!==model.id||ctx.model?.provider!==model.provider) {
            if(!await pi.setModel(model))throw new Error(`Cannot select ${route.model}; sign in with /login or use --routing off.`);
          }
          pi.setThinkingLevel(route.effort);
          if(pi.getThinkingLevel()!==route.effort)throw new Error(`Model does not support routed effort: ${route.model} ${route.effort}`);
          record({phase:'decision',...route});status(ctx);onRoute(route);
          return {action:'continue'};
        } catch(e) {
          // Pi reports extension errors and may continue; explicitly handle the
          // input so a failed route cannot silently run a different model.
          error=e;record({phase:'error',model:route.model,error:e.message});
          if(ctx.mode==='tui')ctx.ui.notify(`Routing failed: ${e.message}`,'error');
          return {action:'handled'};
        } finally {applying=false;}
      });
      pi.registerCommand('routing',{
        description:'Show routing or choose auto / off (manual model selection)',
        handler:async(args,ctx)=>{
          const mode=args.trim();
          if(mode&&!['auto','off'].includes(mode)) {ctx.ui.notify('Use /routing auto or /routing off','error');return;}
          if(mode) {
            await ctx.waitForIdle();preference.mode=mode;error=null;
            if(mode==='auto')complexContext ||= complexHistory(ctx);
            record({phase:'mode',mode,reason:'command'});
          }
          prime(ctx);status(ctx);
          ctx.ui.notify(preference.mode==='auto'
            ? 'Routing auto: Luna High for simpler requests, Sol Low for complex requests. Sol stays selected after complex context; /new starts fresh. Queued input keeps the active model.'
            : 'Routing off: current model and effort stay under manual control. Use /model and /settings.','info');
        },
      });
    },
  };
}
