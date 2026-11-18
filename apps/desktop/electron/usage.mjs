import {calculateContextTokens} from '@earendil-works/pi-coding-agent';

const number=value=>Number.isFinite(value)?value:null;
export function sessionUsage(session){
  const stats=session?.getSessionStats?.();
  if(!stats)return null;
  const context=stats.contextUsage??session.getContextUsage?.();
  return {cost:number(stats.cost),totalTokens:number(stats.tokens?.total),windowTokens:number(context?.tokens),windowPercent:number(context?.percent)};
}

// Per-run spend cap. Defaults are a logged guess; env overrides exist for tests.
export function runCaps(env=process.env){
  const pick=(raw,fallback)=>{const value=Number(raw);return raw!==undefined&&raw!==''&&Number.isFinite(value)&&value>=0?value:fallback;};
  return {usd:pick(env.SUFFICE_RUN_CAP_USD,5),tokens:pick(env.SUFFICE_RUN_CAP_TOKENS,2000000)};
}
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
