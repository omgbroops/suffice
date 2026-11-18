import {resolve} from 'node:path';
import {calculateContextTokens} from '@earendil-works/pi-coding-agent';
import {createBudget,createFileStore} from '../../../packages/backend/src/budget/index.mjs';

const number=value=>Number.isFinite(value)?value:null;
export function sessionUsage(session){
  const stats=session?.getSessionStats?.();
  if(!stats)return null;
  const context=stats.contextUsage??session.getContextUsage?.();
  const split=Number.isFinite(stats.tokens?.input)?{inputTokens:stats.tokens.input,outputTokens:number(stats.tokens.output)??0}:{};
  return {cost:number(stats.cost),totalTokens:number(stats.tokens?.total),windowTokens:number(context?.tokens),windowPercent:number(context?.percent),...split};
}

// Per-run spend cap: env (tests) beats the Settings > Usage choice beats the default. "No cap" is Infinity.
const choice=(value,unit)=>{if(value==='No cap')return Infinity;const m=/^\$?(\d+(?:\.\d+)?)([KM]?)$/.exec(String(value??''));return m?Number(m[1])*(unit&&m[2]==='M'?1e6:unit&&m[2]==='K'?1e3:1):undefined;};
export function runCaps(env=process.env,settings={}){
  const pick=(raw,chosen,fallback)=>{const value=Number(raw);return raw!==undefined&&raw!==''&&Number.isFinite(value)&&value>=0?value:chosen??fallback;};
  return {usd:pick(env.SUFFICE_RUN_CAP_USD,choice(settings['run-cap-usd']),5),tokens:pick(env.SUFFICE_RUN_CAP_TOKENS,choice(settings['run-cap-tokens'],true),2000000)};
}
// Daily token ceiling through the backend budget (window resets at local midnight, persisted in home/budget.json). Null when Off.
export function dailyBudget(home,settings={}){
  const tokens=choice(settings['budget-daily-tokens'],true);if(!Number.isFinite(tokens))return null;
  return createBudget({clock:{now:()=>Date.now()},store:createFileStore(resolve(home,'budget.json')),limits:[{name:'daily',tokens,period:'day',utcOffsetMinutes:-new Date().getTimezoneOffset()}]});
}
export function budgetStatus(home,settings={}){return dailyBudget(home,settings)?.status()[0]??null;}
export function recordSpend(state,now){const n=(now?.totalTokens??0)-(state?.base?.totalTokens??0);if(state?.budget&&n>0)state.budget.record({inputTokens:n,outputTokens:0});}
const compact=n=>n>=1e6?`${+(n/1e6).toFixed(1)}M`:n>=1e3?`${+(n/1e3).toFixed(1)}K`:String(n);
// Returns the stop message when the run delta is strictly over a cap, else null. Unknown cost is checked by tokens alone.
export function runCapExceeded(base,now,caps){
  const tokens=(now?.totalTokens??0)-(base?.totalTokens??0),cost=(now?.cost??0)-(base?.cost??0);
  const overTokens=tokens>caps.tokens,overCost=now?.cost!=null&&cost>caps.usd;
  if(!overTokens&&!overCost)return null;
  const spent=`spent $${cost.toFixed(2)}, ${compact(tokens)} tokens`;
  return overCost?`Stopped: this run reached its $${caps.usd.toFixed(2)} cap (${spent}).`:`Stopped: this run reached its ${compact(caps.tokens)} token cap (${spent}).`;
}

// Saved sessions can be inspected without starting an agent or making a request.
export function savedUsage(entries,model){
  let cost=0,totalTokens=0,hasUsage=false,lastAssistant=null,compacted=false;
  for(const entry of entries){
    if(entry.type==='compaction'){compacted=true;lastAssistant=null;}
    const message=entry.type==='message'?entry.message:null;
    const usage=message?.usage??(['usage','compaction','branch_summary'].includes(entry.type)?entry.usage:null);
    if(usage){
      hasUsage=true;
      totalTokens+=['input','output','cacheRead','cacheWrite'].reduce((sum,key)=>sum+(number(usage[key])??0),0);
      cost+=number(usage.cost?.total)??0;
    }
    if(message?.role==='assistant'&&message.usage&&!['error','aborted'].includes(message.stopReason)){lastAssistant=message;compacted=false;}
  }
  const tokens=lastAssistant&&!compacted?number(calculateContextTokens(lastAssistant.usage)):null;
  return {cost:hasUsage?cost:null,totalTokens:hasUsage?totalTokens:null,windowTokens:tokens,windowPercent:tokens!==null&&model?.contextWindow>0?tokens/model.contextWindow*100:null};
}
